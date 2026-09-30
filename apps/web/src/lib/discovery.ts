import { AshbyAdapter, experienceCompatibility, GreenhouseAdapter, JobDiscoveryService, JobicyAdapter, LeverAdapter, RemoteOKAdapter, RemotiveAdapter, roleMatchesTarget, SmartRecruitersAdapter, sourcePollingDecision, WeWorkRemotelyAdapter, WorkableAdapter, type JobSourceAdapter, type JobSourceRegistryRecord, type NormalizedJob, type SourceRunSummary } from "@rolevana/job-sources";
import { readLocalProfile } from "./local-store";
import { readJobSourceRegistry, registerDetectedCompanySources, saveSourceRuns, updateRegistryFromRuns, upsertLocalJobs } from "./job-store";
import { classifyAmbiguousJobs } from "./ai-classification";
import { findRole } from "@rolevana/domain";
import { enqueueBrainJobs, reconcileBrainQueueEligibility } from "./brain-store";

function adapterFor(record: JobSourceRegistryRecord): JobSourceAdapter | null {
  if (record.provider === "REMOTE_OK") return new RemoteOKAdapter();
  if (record.provider === "JOBICY") return new JobicyAdapter();
  if (record.provider === "WE_WORK_REMOTELY") return new WeWorkRemotelyAdapter();
  if (record.provider === "REMOTIVE") return new RemotiveAdapter();
  if (record.provider === "ASHBY") return new AshbyAdapter(record.companyName, record.boardIdentifier);
  if (record.provider === "GREENHOUSE") return new GreenhouseAdapter(record.companyName, record.boardIdentifier);
  if (record.provider === "LEVER") return new LeverAdapter(record.companyName, record.boardIdentifier, record.baseUrl);
  if (record.provider === "SMARTRECRUITERS") return new SmartRecruitersAdapter(record.companyName,record.boardIdentifier);
  if (record.provider === "WORKABLE") return new WorkableAdapter(record.companyName,record.boardIdentifier);
  return null;
}

export async function runJobDiscovery(userId: string, source?: string, force=false) {
  const [profile, registry] = await Promise.all([readLocalProfile(userId), readJobSourceRegistry(userId)]);
  const sourceKey = source?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matching=registry.filter((record)=>(!sourceKey||record.provider.toLowerCase().replace(/[^a-z0-9]/g,"")===sourceKey||record.id.toLowerCase().replace(/[^a-z0-9]/g,"")===sourceKey));const now=Date.now();
  const selected=matching.filter((record)=>record.sourceType!=="PORTAL"&&sourcePollingDecision(record,new Date(now),force).due);
  const skipped:SourceRunSummary[]=matching.filter((record)=>!selected.includes(record)).map((record)=>{const decision=sourcePollingDecision(record,new Date(now),force);const reason=record.sourceType==="PORTAL"?"DISABLED" as const:decision.due?"DISABLED" as const:decision.reason;const at=new Date().toISOString();return{sourceId:record.id,provider:record.provider,...(record.sourceType?{sourceType:record.sourceType}:{}),...(!record.enabled||record.sourceType==="PORTAL"?{health:"DISABLED" as const}:reason==="COOLDOWN"?{health:"COOLDOWN" as const}:record.health?{health:record.health}:{}),skippedReason:reason,...(!decision.due&&decision.nextEligibleSync?{nextEligibleSync:decision.nextEligibleSync}:{}),startedAt:at,finishedAt:at,jobsFetched:0,jobsCreated:0,jobsUpdated:0,duplicatesFound:0,jobsRejectedNonRemote:0,jobsRejectedLocation:0,jobsRejectedRole:0,ambiguousJobs:0,latencyMs:0};});
  const adapters = selected.map(adapterFor).filter((adapter): adapter is JobSourceAdapter => adapter !== null);
  const role = findRole(profile?.primaryTargetRoleTitle ?? "");
  const target = profile?.primaryTargetRoleTitle ? { selectedRoleTitle: profile.primaryTargetRoleTitle, roleCategory: profile.primaryTargetRoleCategory, relatedTitles: role?.relatedTitles ?? [], includeRelatedTitles: profile.includeRelatedTitles, candidateYearsExperience: profile.totalYearsExperience, experienceToleranceYears: profile.experienceToleranceYears } : undefined;
  const scan = await new JobDiscoveryService(adapters, profile?.allowedRegions ?? ["India", "Worldwide", "APAC"], target).scan();
  const classified = await classifyAmbiguousJobs(userId, scan.jobs, Number(process.env.AI_JOB_ANALYSIS_BATCH_SIZE ?? 10), target);
  const persisted = await upsertLocalJobs(userId, classified);
  const atsBoardsDiscovered=await registerDetectedCompanySources(userId,classified);
  const createdIds=new Set(persisted.createdJobIds);const queuedToBrain=await enqueueBrainJobs(userId,persisted.jobs.filter((job)=>createdIds.has(job.id??job.descriptionHash)&&job.status==="QUALIFIED_BY_FILTER"));
  await reconcileBrainQueueEligibility(userId,persisted.jobs);
  const scanSummary={targetRoleMatches:target?classified.filter((job)=>roleMatchesTarget(job.title,job.roleCategory,target.selectedRoleTitle,target.roleCategory,target.relatedTitles,target.includeRelatedTitles)===true).length:classified.filter((job)=>job.frontendClassification==="FRONTEND"||job.frontendClassification==="FRONTEND_HEAVY").length,needsClassification:classified.filter((job)=>job.status==="NEEDS_CLASSIFICATION"||job.status==="WAITING_FOR_FREE_AI").length,remoteEligible:classified.filter((job)=>job.status==="QUALIFIED_BY_FILTER").length,experienceCompatible:target?classified.filter((job)=>roleMatchesTarget(job.title,job.roleCategory,target.selectedRoleTitle,target.roleCategory,target.relatedTitles,target.includeRelatedTitles)===true&&experienceCompatibility(target.candidateYearsExperience,job.minimumYearsExperience,target.experienceToleranceYears)==="COMPATIBLE").length:0,qualifiedJobs:classified.filter((job)=>job.status==="QUALIFIED_BY_FILTER").length,skippedLowValueOrIneligible:Math.max(0,persisted.created-queuedToBrain)};
  const runs = [...scan.runs.map((run) => {const stats=persisted.bySource[run.provider];return{ ...run, jobsCreated: stats?.created??0, jobsUpdated: stats?.updated??0,duplicatesFound:stats?.duplicates??0 }}),...skipped];
  await Promise.all([saveSourceRuns(userId, runs), updateRegistryFromRuns(userId, runs)]);
  return { ...scan, runs, jobs: persisted.jobs, persistence: persisted,atsBoardsDiscovered,queuedToBrain,scanSummary,applicationsSubmitted: 0 as const, emailsSent: 0 as const,employerContacts:0 as const, dryRun: true as const };
}

export function discoveryMetrics(jobs: NormalizedJob[], now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return {
    jobsDiscoveredToday: jobs.filter((job) => job.discoveredAt >= today).length,
    newLastHour: jobs.filter((job) => now.getTime() - job.discoveredAt.getTime() < 3_600_000).length,
    remoteJobs: jobs.filter((job) => job.workplaceType === "REMOTE").length,
    remoteFrontendJobs: jobs.filter((job) => job.workplaceType === "REMOTE" && ["FRONTEND", "FRONTEND_HEAVY"].includes(job.frontendClassification)).length,
    locationEligibleJobs: jobs.filter((job) => job.status === "QUALIFIED_BY_FILTER").length,
    rejectedNonRemote: jobs.filter((job) => job.status === "REJECTED_NOT_REMOTE").length,
    rejectedGeography: jobs.filter((job) => job.status === "REJECTED_LOCATION").length,
    rejectedNonFrontend: jobs.filter((job) => job.status === "REJECTED_ROLE").length,
    needsClassification: jobs.filter((job) => job.status === "NEEDS_CLASSIFICATION" || job.status === "WAITING_FOR_FREE_AI").length,
    duplicates: jobs.filter((job) => job.sourceReferences.length > 1).length
  };
}

export function discoveryMetricsFromSummaries(items: Array<{ discoveredAt: Date | string; workplaceType: string; frontendClassification: string; status: string; duplicateSources: number;freshness?:string }>, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const toDate = (v: Date | string) => v instanceof Date ? v : new Date(v);
  return {
    jobsDiscoveredToday: items.filter((i) => toDate(i.discoveredAt) >= today).length,
    newLastHour: items.filter((i) => now.getTime() - toDate(i.discoveredAt).getTime() < 3_600_000).length,
    remoteEligible: items.filter((i) => i.status === "QUALIFIED_BY_FILTER").length,
    needsClassification: items.filter((i) => i.status === "NEEDS_CLASSIFICATION" || i.status === "WAITING_FOR_FREE_AI").length,
    rejected: items.filter((i) => i.status.startsWith("REJECTED")).length,
    duplicates: items.filter((i) => i.duplicateSources > 1).length,
    total: items.length,justPosted:items.filter((item)=>item.freshness==="JUST_POSTED").length,veryFresh:items.filter((item)=>item.freshness==="VERY_FRESH").length,today:items.filter((item)=>item.freshness==="TODAY").length,recent:items.filter((item)=>item.freshness==="RECENT").length,older:items.filter((item)=>item.freshness==="OLDER").length
  };
}
