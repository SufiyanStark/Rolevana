import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BrainRecord, ResumeVersion, WorkerActivity } from "@rolevana/brain";
import { getLocalDataDirectory } from "./local-store";

const safe=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,"_");
const directory=(userId:string)=>path.join(getLocalDataDirectory(),safe(userId),"brain");
const file=(userId:string,name:string)=>path.join(directory(userId),name);
const read=async<T>(target:string,fallback:T):Promise<T>=>{try{return JSON.parse(await readFile(target,"utf8")) as T;}catch{return fallback;}};
const write=async(target:string,value:unknown)=>{await mkdir(path.dirname(target),{recursive:true});const temporary=`${target}.${process.pid}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2),"utf8");await rename(temporary,target);};

export type ReviewItem={id:string;jobId:string;jobTitle:string;company:string;reasons:string[];state:"OPEN"|"RESOLVED";createdAt:string};
export type BrainMetrics={jobsProcessedToday:number;qualifiedToday:number;matchedToday:number;resumeReadyToday:number;applicationReadyToday:number;applicationsSubmittedToday:0;emailsSentToday:0};
export type BrainSnapshot={records:BrainRecord[];activities:WorkerActivity[];reviews:ReviewItem[];metrics:BrainMetrics};
export async function readBrainRecords(userId:string){return read<BrainRecord[]>(file(userId,"records.json"),[]);}
export async function readBrainRecord(userId:string,jobId:string){return (await readBrainRecords(userId)).find((item)=>item.jobId===jobId)??null;}
export async function saveBrainRecord(userId:string,record:BrainRecord){const current=await readBrainRecords(userId);const next=[record,...current.filter((item)=>item.jobId!==record.jobId)].slice(0,1000);await write(file(userId,"records.json"),next);if(record.resumeVersion)await write(file(userId,`resume-versions/${safe(record.resumeVersion.id)}.json`),record.resumeVersion);if(record.reviewReasons.length)await upsertReview(userId,record);await appendLog(userId,record);}
async function upsertReview(userId:string,record:BrainRecord){const current=await read<ReviewItem[]>(file(userId,"review-queue.json"),[]);const existing=current.find((item)=>item.jobId===record.jobId&&item.state==="OPEN");const item:ReviewItem={id:existing?.id??randomUUID(),jobId:record.jobId,jobTitle:record.jobTitle,company:record.company,reasons:record.reviewReasons,state:"OPEN",createdAt:existing?.createdAt??new Date().toISOString()};await write(file(userId,"review-queue.json"),[item,...current.filter((value)=>value.id!==item.id)]);}
async function appendLog(userId:string,record:BrainRecord){const current=await read<Array<Record<string,unknown>>>(file(userId,"events.json"),[]);const events=record.transitions.map((item)=>({jobId:record.jobId,agent:item.agent,task:item.state,provider:record.provenance.at(-1)?.provider??"deterministic",model:record.provenance.at(-1)?.model??"rules-v1",durationMs:new Date(record.updatedAt).getTime()-new Date(record.startedAt).getTime(),resultStatus:record.state,fallbackCount:record.provenance.at(-1)?.fallbackCount??0,rateLimited:false,at:item.at}));await write(file(userId,"events.json"),[...events,...current].slice(0,5000));}
export async function saveWorkerActivities(userId:string,activities:WorkerActivity[]){await write(file(userId,"worker-activity.json"),activities);}
export async function readWorkerActivities(userId:string){return read<WorkerActivity[]>(file(userId,"worker-activity.json"),[]);}
export async function readReviewQueue(userId:string){return read<ReviewItem[]>(file(userId,"review-queue.json"),[]);}
export async function readResumeVersion(userId:string,id:string){return read<ResumeVersion|null>(file(userId,`resume-versions/${safe(id)}.json`),null);}
export function brainMetrics(records:BrainRecord[],now=new Date()):BrainMetrics{const day=now.toISOString().slice(0,10);const today=records.filter((record)=>record.startedAt.slice(0,10)===day);return{jobsProcessedToday:today.length,qualifiedToday:today.filter((item)=>item.transitions.some((value)=>value.state==="QUALIFIED")).length,matchedToday:today.filter((item)=>item.match).length,resumeReadyToday:today.filter((item)=>item.resumeVersion).length,applicationReadyToday:today.filter((item)=>item.application?.status==="READY_FOR_APPLICATION").length,applicationsSubmittedToday:0,emailsSentToday:0};}
export async function readBrainSnapshot(userId:string):Promise<BrainSnapshot>{const[records,activities,reviews]=await Promise.all([readBrainRecords(userId),readWorkerActivities(userId),readReviewQueue(userId)]);return{records,activities,reviews,metrics:brainMetrics(records)};}
