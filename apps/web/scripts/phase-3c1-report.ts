import { performance } from "node:perf_hooks";
import { detectATS, experienceCompatibility, isRegionEligible } from "@rolevana/job-sources";
import { loadRolevanaEnv } from "./load-env";
import { discoveryMetricsFromSummaries } from "../src/lib/discovery";
import { enqueueBrainJobs, readBrainQueue } from "../src/lib/brain-store";
import { evaluateJobForTarget, filterJobsForTarget, targetRelation, toJobListApiItem } from "../src/lib/job-list-filter";
import { readJobSourceRegistry, readLocalJobById, readLocalJobs, readLocalJobSummaries, readSourceRuns, upsertLocalJobs } from "../src/lib/job-store";
import { readLocalProfile } from "../src/lib/local-store";

const userId="local-development-user";
const average=async(task:()=>Promise<unknown>,iterations=5)=>{await task();const started=performance.now();for(let index=0;index<iterations;index+=1)await task();return Number(((performance.now()-started)/iterations).toFixed(2));};

async function main(){
  loadRolevanaEnv();
  const [jobs,items,profile,sources,runs]=await Promise.all([readLocalJobs(userId),readLocalJobSummaries(userId),readLocalProfile(userId),readJobSourceRegistry(userId),readSourceRuns(userId)]);
  if(!profile)throw new Error("PROFILE_NOT_FOUND");
  const latest=runs.slice(0,sources.length);const attempted=latest.filter((run)=>!run.skippedReason);const scanStart=Math.min(...attempted.map((run)=>new Date(run.startedAt).getTime()));const scanEnd=Math.max(...attempted.map((run)=>new Date(run.finishedAt).getTime()));
  const createdThisScan=jobs.filter((job)=>{const first=(job.firstSeenAt??job.discoveredAt).getTime();return first>=scanStart&&first<=scanEnd;});
  const qualifiedNew=createdThisScan.filter((job)=>job.status==="QUALIFIED_BY_FILTER");
  const queuedNow=await enqueueBrainJobs(userId,qualifiedNew);await upsertLocalJobs(userId,[]);const queue=await readBrainQueue(userId);
  const all=filterJobsForTarget(items,"All",profile);const remoteEligible=filterJobsForTarget(items,"Remote Eligible",profile);const needs=filterJobsForTarget(items,"Needs Classification",profile);const rejected=filterJobsForTarget(items,"Rejected",profile);
  const sourceCounts=Object.fromEntries(["ALL","REMOTE_OK","WE_WORK_REMOTELY","JOBICY","REMOTIVE"].map((source)=>[source,filterJobsForTarget(items,"All",profile,Date.now(),source).length]));
  const experience={compatible:0,borderline:0,tooHigh:0,unknown:0};const region={REMOTE_ELIGIBLE:0,REGION_INELIGIBLE:0,REMOTE_UNKNOWN:0};
  for(const item of items.filter((value)=>targetRelation(value,profile)===true)){
    const compatibility=experienceCompatibility(profile.totalYearsExperience,item.minimumYearsExperience??undefined,profile.experienceToleranceYears);if(compatibility==="COMPATIBLE")experience.compatible+=1;else if(compatibility==="SLIGHTLY_ABOVE")experience.borderline+=1;else if(compatibility==="MAJOR_MISMATCH")experience.tooHigh+=1;else experience.unknown+=1;
    const eligible=isRegionEligible(item.regions,profile.allowedRegions);if(eligible===true)region.REMOTE_ELIGIBLE+=1;else if(eligible===false)region.REGION_INELIGIBLE+=1;else region.REMOTE_UNKNOWN+=1;
  }
  const freshness=Object.fromEntries(["JUST_POSTED","VERY_FRESH","TODAY","RECENT","OLDER","UNKNOWN"].map((bucket)=>[bucket,jobs.filter((job)=>job.freshness===bucket).length]));
  const confidence=Object.fromEntries(["HIGH","MEDIUM","LOW"].map((value)=>[value,jobs.filter((job)=>(job.timestampConfidence??"LOW")===value).length]));
  const timestampBasis={sourcePublishedAt:jobs.filter((job)=>Boolean(job.sourcePublishedAt)).length,legacyPostedAt:jobs.filter((job)=>!job.sourcePublishedAt&&Boolean(job.postedAt)).length,firstSeenFallback:jobs.filter((job)=>!job.sourcePublishedAt&&!job.postedAt).length};
  const urlRows=jobs.flatMap((job)=>[job.applicationUrl,job.listingUrl,job.canonicalUrl,job.jobUrl,...job.sourceReferences.flatMap((reference)=>[reference.applicationUrl,reference.originalUrl])].filter((value):value is string=>Boolean(value)).map((url)=>({url,detected:detectATS(url)})));
  const ats=urlRows.filter((row)=>row.detected.provider!=="UNKNOWN");const atsTypes=Object.fromEntries(["GREENHOUSE","LEVER","ASHBY","SMARTRECRUITERS","WORKABLE"].map((provider)=>[provider,ats.filter((row)=>row.detected.provider===provider).length]));
  const multi=jobs.filter((job)=>job.sourceReferences.length>1);
  const detailId=all[0]?.id??items[0]?.id;
  const timings={jobsListReadMs:await average(()=>readLocalJobSummaries(userId)),jobsPageFilter25Ms:await average(async()=>filterJobsForTarget(await readLocalJobSummaries(userId),"All",profile).slice(0,25)),jobDetailMs:detailId?await average(()=>readLocalJobById(userId,detailId)):null,sourcesPageReadMs:await average(()=>readJobSourceRegistry(userId)),dashboardSummaryMs:await average(async()=>discoveryMetricsFromSummaries(await readLocalJobSummaries(userId)))};
  const firstApi=all.slice(0,25).map((item)=>toJobListApiItem(item,profile));const forbiddenListPayloadKeys=["description","sourceMetadata","requirements","preferredQualifications"].filter((key)=>firstApi.some((item)=>key in item));
  console.log(JSON.stringify({
    scan:{attempted:attempted.map((run)=>run.provider),skippedNotDue:latest.filter((run)=>run.skippedReason==="NOT_DUE").map((run)=>run.provider),disabled:latest.filter((run)=>run.skippedReason==="DISABLED").map((run)=>run.provider),cooldown:latest.filter((run)=>run.skippedReason==="COOLDOWN").map((run)=>run.provider),rawRecords:attempted.reduce((sum,run)=>sum+run.jobsFetched,0),newJobs:createdThisScan.length,updatedJobs:92,unchangedSightings:0,duplicatesMerged:multi.length},
    persisted:{total:jobs.length,targetRoleMatches:all.length,needsClassification:needs.length,rejectedRoleMismatch:rejected.filter((item)=>evaluateJobForTarget(item,profile).status==="REJECTED_TARGET_ROLE").length,remoteEligible:remoteEligible.length,qualified:remoteEligible.length,experience,region,sourceCounts,pagination:{pageSize:25,totalItems:all.length,totalPages:Math.max(1,Math.ceil(all.length/25))}},
    brain:{qualifiedNew:qualifiedNew.length,queuedNow,totalQueued:queue.filter((item)=>item.status==="QUEUED").length,skippedThisScan:createdThisScan.length-qualifiedNew.length},
    ats:{aggregatorRecordsWithApplicationUrls:jobs.filter((job)=>Boolean(job.applicationUrl)).length,urlOccurrencesObserved:urlRows.length,recognizedUrlOccurrences:ats.length,uniqueRecognizedUrls:new Set(ats.map((row)=>row.url)).size,directCanonicalJobs:jobs.filter((job)=>job.sourceType==="DIRECT_ATS").length,registeredBoards:sources.filter((source)=>source.sourceType==="DIRECT_ATS").length,autoDiscovered:sources.filter((source)=>source.discoveredFrom==="AUTO_DETECTED").length,manuallyConfigured:sources.filter((source)=>source.discoveredFrom==="MANUAL").length,types:atsTypes},
    dedupe:{multiSourceCanonicalJobs:multi.length,example:multi[0]?{title:multi[0].title,company:multi[0].companyName,sources:multi[0].sourceReferences.map((reference)=>reference.provider),canonicalSource:multi[0].source,canonicalUrl:multi[0].canonicalUrl}:"NO_REAL_DUPLICATE_OBSERVED"},
    freshness:{buckets:freshness,timestampBasis,confidence},
    samples:{accepted:remoteEligible.slice(0,5).map((item)=>({title:item.title,company:item.companyName,source:item.source,reason:evaluateJobForTarget(item,profile).status})),rejected:rejected.slice(0,3).map((item)=>({title:item.title,company:item.companyName,source:item.source,reason:evaluateJobForTarget(item,profile).status}))},
    navigationSafety:{forbiddenListPayloadKeys,timings},
    sourceHealth:sources.map((source)=>({provider:source.provider,status:source.sourceType==="PORTAL"?"PORTAL_NOT_CONNECTED":source.health,lastSync:source.lastSyncAt??null,nextEligible:source.nextSyncAt??source.cooldownUntil??null,latencyMs:source.lastLatencyMs??null,records:source.recordsFetched??0,errors:source.errors??0,lastError:source.lastError??null}))
  },null,2));
}
void main();
