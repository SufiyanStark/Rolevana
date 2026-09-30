import { calculatePriority, matchJob, prepareApplication, RolevanaOrchestrator, runWorkerPool, type BrainRecord, type WorkerActivity } from "@rolevana/brain";
import { parseEnv } from "@rolevana/config";
import { readLocalJobs, readLocalJobById } from "./job-store";
import { readLocalProfile, readLocalResume } from "./local-store";
import { readBrainQueue, readBrainRecords, saveBrainRecord, saveWorkerActivities, setBrainQueueStatus } from "./brain-store";
import { applyAIResumeTailoring, WaitingForFreeAIError } from "./brain-ai";

const assertSafety=()=>{const env=parseEnv(process.env);if(!env.DRY_RUN)throw new Error("PHASE_3A_REQUIRES_DRY_RUN");if(!env.FREE_AI_ONLY||env.MAX_AI_COST_USD!==0)throw new Error("FREE_AI_SAFETY_ASSERTION_FAILED");return env;};
export async function processWithRolevana(userId:string,jobId:string,workerId:number|null=null){const env=assertSafety();const[job,profile,resume]=await Promise.all([readLocalJobById(userId,jobId),readLocalProfile(userId),readLocalResume(userId)]);if(!job||!profile)throw new Error("JOB_OR_PROFILE_NOT_FOUND");let record=new RolevanaOrchestrator({minimumMatchScore:env.MINIMUM_MATCH_SCORE}).process(job,profile,resume,workerId);if(record.resumeStrategy==="TAILORED_RESUME")try{record=await applyAIResumeTailoring(userId,job,profile,resume,record);}catch(error){if(!(error instanceof WaitingForFreeAIError))throw error;record.state="WAITING_FOR_FREE_AI";record.reviewReasons.push(`No verified-free provider is currently available for resume tailoring (${error.reasons.join(", ")}).`);record.updatedAt=new Date().toISOString();}await saveBrainRecord(userId,record);return record;}
export async function runRolevanaBrain(userId:string,requestedLimit:number){const env=assertSafety();const limit=[1,5,10].includes(requestedLimit)?requestedLimit:1;const[jobs,profile,resume,existing,queue]=await Promise.all([readLocalJobs(userId),readLocalProfile(userId),readLocalResume(userId),readBrainRecords(userId),readBrainQueue(userId)]);if(!profile)throw new Error("PROFILE_NOT_FOUND");const queued=new Set(queue.filter((item)=>item.status==="QUEUED").map((item)=>item.jobId));const completed=new Map(existing.map((item)=>[item.jobId,item]));const candidates=jobs.filter((job)=>{const id=job.id??job.descriptionHash;if(job.status!=="QUALIFIED_BY_FILTER"||!queued.has(id))return false;const prior=completed.get(id);return !prior||prior.jobHash!==job.descriptionHash||!["APPLICATION_PREPARED","NEEDS_REVIEW","REJECTED_ROLE","REJECTED_LOCATION","REJECTED_EXPERIENCE"].includes(prior.state);}).map((job)=>{const match=matchJob(job,profile);return{job,priorityScore:calculatePriority(job,match).score};}).sort((left,right)=>right.priorityScore-left.priorityScore).slice(0,limit);
  const activities:WorkerActivity[]=Array.from({length:env.ROLEVANA_WORKER_CONCURRENCY},(_,index)=>({workerId:index+1,jobId:null,jobTitle:null,company:null,state:"IDLE"}));await saveWorkerActivities(userId,activities);const records:BrainRecord[]=[];
  await runWorkerPool(candidates,env.ROLEVANA_WORKER_CONCURRENCY,async(candidate,workerId)=>{const jobId=candidate.job.id??candidate.job.descriptionHash;await setBrainQueueStatus(userId,jobId,"PROCESSING");activities[workerId-1]={workerId,jobId,jobTitle:candidate.job.title,company:candidate.job.companyName,state:"QUALIFYING"};await saveWorkerActivities(userId,activities);const record=new RolevanaOrchestrator({minimumMatchScore:env.MINIMUM_MATCH_SCORE}).process(candidate.job,profile,resume,workerId);records.push(record);await saveBrainRecord(userId,record);await setBrainQueueStatus(userId,jobId,"COMPLETED");activities[workerId-1]={workerId,jobId:null,jobTitle:null,company:null,state:"IDLE"};await saveWorkerActivities(userId,activities);});return records.sort((left,right)=>right.priorityScore-left.priorityScore);
}

export async function refreshReadinessOnly(userId:string){
  const[jobs,profile,resume,records]=await Promise.all([readLocalJobs(userId),readLocalProfile(userId),readLocalResume(userId),readBrainRecords(userId)]);
  if(!profile)return 0;
  const byId=new Map(jobs.map((job)=>[job.id??job.descriptionHash,job]));let updated=0;
  for(const record of records){const job=byId.get(record.jobId);if(!job||!record.match||!record.application)continue;
    const retained=record.reviewReasons.filter((reason)=>!/master resume verification|verified answer required|application method is unsupported/i.test(reason));
    if(resume?.verificationStatus!=="VERIFIED")retained.push("Master resume verification is required before this prepared version can be used.");
    record.application=prepareApplication(job,profile,record.recommendedResume==="TAILORED_RESUME"?record.resumeVersion?.id??null:null);
    record.reviewReasons=[...new Set([...retained,...record.application.reviewReasons])];
    record.state=record.reviewReasons.length?"NEEDS_REVIEW":"APPLICATION_PREPARED";record.updatedAt=new Date().toISOString();record.completedAt=record.updatedAt;
    record.transitions.push({state:record.state,at:record.updatedAt,agent:"ApplicationPrepAgent",reason:"Re-evaluated readiness after verified profile or master-resume facts changed; discovery, qualification, and tailoring were not rerun."});
    await saveBrainRecord(userId,record);updated+=1;
  }return updated;
}
