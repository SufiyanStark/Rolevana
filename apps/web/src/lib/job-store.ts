import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getLocalDataDirectory } from "./local-store";
import { classifyRoleCategory, decodeHtmlEntities, detectATS, extractExperienceRequirement, normalizeRemoteRegions, parseSupportedBoardUrl, type DiscoveryStatus, type FreshnessBucket, type JobSourceProvider,type JobSourceType, type JobSourceRegistryRecord, type NormalizedJob, type RemoteRegion, type Seniority, type SourceRunSummary, type WorkplaceType } from "@rolevana/job-sources";
import type { AIJobClassification, AIProviderHealth } from "@rolevana/ai";

const safeUserId = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, "_");
const directoryFor = (userId: string) => path.join(getLocalDataDirectory(), safeUserId(userId));
const readJson = async <T>(file: string, fallback: T): Promise<T> => { try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return fallback; } };
const writeJson = async (file: string, value: unknown) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, file);
};
const registryFile = (userId: string) => path.join(directoryFor(userId), "job-sources.json");
const jobsFile = (userId: string) => path.join(directoryFor(userId), "jobs.json");
const jobsIndexFile = (userId: string) => path.join(directoryFor(userId), "jobs-index.json");
const jobDetailsDirectory = (userId: string) => path.join(directoryFor(userId), "job-details");
const jobDetailFile = (userId: string, id: string) => path.join(jobDetailsDirectory(userId), `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
const runsFile = (userId: string) => path.join(directoryFor(userId), "job-source-runs.json");
const healthFile = (userId: string) => path.join(directoryFor(userId), "ai-provider-health.json");
const classificationFile = (userId: string) => path.join(directoryFor(userId), "job-classification-cache.json");

const defaultRegistry = (): JobSourceRegistryRecord[] => {
  const now = new Date().toISOString();
  const builtIn=(id:string,provider:JobSourceProvider,name:string,baseUrl:string,sourceType:JobSourceType,enabled:boolean,minimumPollIntervalMinutes:number):JobSourceRegistryRecord=>({id,provider,companyName:name,boardIdentifier:id,baseUrl,sourceType,enabled,minimumPollIntervalMinutes,health:enabled?"NOT_CONFIGURED":"DISABLED",discoveredFrom:"BUILT_IN",jobCount:0,recordsFetched:0,newJobs:0,updatedJobs:0,duplicates:0,errors:0,createdAt:now,updatedAt:now});
  const builtIns=[builtIn("remote-ok","REMOTE_OK","Remote OK","https://remoteok.com/api","PUBLIC_API",true,60),builtIn("jobicy","JOBICY","Jobicy","https://jobicy.com/api/v2/remote-jobs","PUBLIC_API",true,60),builtIn("we-work-remotely","WE_WORK_REMOTELY","We Work Remotely","https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss","RSS",true,60),builtIn("remotive","REMOTIVE","Remotive","https://remotive.com/api/remote-jobs","PUBLIC_API",true,360),builtIn("linkedin","LINKEDIN","LinkedIn","https://www.linkedin.com/jobs","PORTAL",false,1440),builtIn("indeed","INDEED","Indeed","https://www.indeed.com","PORTAL",false,1440),builtIn("naukri","NAUKRI","Naukri","https://www.naukri.com","PORTAL",false,1440),builtIn("wellfound","WELLFOUND","Wellfound","https://wellfound.com/jobs","PORTAL",false,1440),builtIn("arc","ARC","Arc","https://arc.dev/remote-jobs","PORTAL",false,1440)];
  const seeds = (process.env.JOB_SOURCE_BOARD_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean).flatMap((boardUrl) => {
    const parsed = parseSupportedBoardUrl(boardUrl);
    if (!parsed) return [];
    return [{ id: `${parsed.provider.toLowerCase()}:${parsed.boardIdentifier}`, provider: parsed.provider,sourceType:"DIRECT_ATS",atsType:parsed.provider,atsIdentifier:parsed.boardIdentifier, companyName: parsed.boardIdentifier, boardIdentifier: parsed.boardIdentifier,careerUrl:boardUrl, ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}), enabled: true,minimumPollIntervalMinutes:60,health:"NOT_CONFIGURED",discoveredFrom:"MANUAL", jobCount: 0, createdAt: now, updatedAt: now } satisfies JobSourceRegistryRecord];
  });
  return [...builtIns, ...seeds];
};

export async function readJobSourceRegistry(userId: string): Promise<JobSourceRegistryRecord[]> {
  const records = await readJson<JobSourceRegistryRecord[]>(registryFile(userId), []);
  if (records.length) {const defaults=defaultRegistry();const merged=[...records.map((record)=>({...defaults.find((item)=>item.id===record.id),...record} as JobSourceRegistryRecord)),...defaults.filter((item)=>!records.some((record)=>record.id===item.id))];if(JSON.stringify(merged)!==JSON.stringify(records))await writeJson(registryFile(userId),merged);return merged;}
  const defaults = defaultRegistry(); await writeJson(registryFile(userId), defaults); return defaults;
}

export async function addJobSourceFromUrl(userId: string, companyName: string, boardUrl: string): Promise<JobSourceRegistryRecord> {
  const parsed = parseSupportedBoardUrl(boardUrl);
  if (!parsed) throw new Error("UNSUPPORTED_SOURCE");
  const records = await readJobSourceRegistry(userId);
  const existing = records.find((record) => record.provider === parsed.provider && record.boardIdentifier === parsed.boardIdentifier);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: JobSourceRegistryRecord = { id: randomUUID(), provider: parsed.provider,sourceType:"DIRECT_ATS",atsType:parsed.provider,atsIdentifier:parsed.boardIdentifier, companyName: companyName.trim() || parsed.boardIdentifier, boardIdentifier: parsed.boardIdentifier,careerUrl:boardUrl, ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}), enabled: true,minimumPollIntervalMinutes:60,health:"NOT_CONFIGURED",discoveredFrom:"MANUAL", jobCount: 0, createdAt: now, updatedAt: now };
  await writeJson(registryFile(userId), [...records, record]);
  return record;
}

export async function setJobSourceEnabled(userId: string, id: string, enabled: boolean) {
  const records = await readJobSourceRegistry(userId);
  const updated = records.map((record) => record.id === id ? { ...record, enabled, updatedAt: new Date().toISOString() } : record);
  await writeJson(registryFile(userId), updated);
  return updated.find((record) => record.id === id) ?? null;
}

export async function registerDetectedCompanySources(userId:string,jobs:NormalizedJob[]){const records=await readJobSourceRegistry(userId);const now=new Date().toISOString();let added=0;for(const job of jobs){const urls=[job.applicationUrl,job.listingUrl,job.canonicalUrl,job.jobUrl,...job.sourceReferences.flatMap((reference)=>[reference.applicationUrl,reference.originalUrl])].filter((value):value is string=>Boolean(value));for(const careerUrl of new Set(urls)){const detected=detectATS(careerUrl);if(!["GREENHOUSE","LEVER","ASHBY","SMARTRECRUITERS","WORKABLE"].includes(detected.provider)||!detected.identifier)continue;const provider=detected.provider as Extract<JobSourceProvider,"GREENHOUSE"|"LEVER"|"ASHBY"|"SMARTRECRUITERS"|"WORKABLE">;if(records.some((record)=>record.provider===provider&&record.boardIdentifier===detected.identifier))break;records.push({id:`${provider.toLowerCase()}:${detected.identifier}`,provider,sourceType:"DIRECT_ATS",health:"NOT_CONFIGURED",companyName:job.companyName,...(job.companyDomain?{companyDomain:job.companyDomain}:{}),careerUrl,atsType:provider,atsIdentifier:detected.identifier,boardIdentifier:detected.identifier,enabled:true,minimumPollIntervalMinutes:60,discoveredFrom:"AUTO_DETECTED",jobCount:0,createdAt:now,updatedAt:now});added+=1;break;}}if(added)await writeJson(registryFile(userId),records);return added;}

type SerializedJob = Omit<NormalizedJob, "postedAt" | "updatedAt" | "sourcePublishedAt" | "sourceUpdatedAt" | "firstSeenAt" | "discoveredAt" | "lastSeenAt"> & {
  postedAt?: string;
  updatedAt?: string;
  sourcePublishedAt?: string; sourceUpdatedAt?: string; firstSeenAt?: string;
  discoveredAt: string;
  lastSeenAt: string;
};

const hydrateJob = (raw: SerializedJob): NormalizedJob => {
  const { postedAt, updatedAt,sourcePublishedAt,sourceUpdatedAt,firstSeenAt, discoveredAt, lastSeenAt, ...rest } = raw;
  const title=decodeHtmlEntities(rest.title).trim();const companyName=decodeHtmlEntities(rest.companyName).trim();
  const experience = extractExperienceRequirement(title, rest.description);
  const invalidStoredExperience = rest.maximumYearsExperience !== undefined && (rest.maximumYearsExperience > 30 || (rest.minimumYearsExperience !== undefined && rest.minimumYearsExperience > rest.maximumYearsExperience));
  return {
    ...rest,
    title,companyName,
    timestampConfidence:sourcePublishedAt?(rest.timestampConfidence??"HIGH"):postedAt?"MEDIUM":"LOW",
    ...(invalidStoredExperience ? { minimumYearsExperience: experience.minimumYearsExperience, maximumYearsExperience: experience.maximumYearsExperience } : {}),
    remoteRegions: rest.remoteRegions.includes("UNKNOWN") ? normalizeRemoteRegions(rest.locations.join(" "), rest.locationRestrictions.join(" ")) : rest.remoteRegions,
    roleCategory: rest.roleCategory ?? classifyRoleCategory(rest.title),
    seniority: rest.seniority ?? experience.seniority,
    ...(rest.minimumYearsExperience === undefined && experience.minimumYearsExperience !== undefined ? { minimumYearsExperience: experience.minimumYearsExperience } : {}),
    ...(rest.maximumYearsExperience === undefined && experience.maximumYearsExperience !== undefined ? { maximumYearsExperience: experience.maximumYearsExperience } : {}),
    discoveredAt: new Date(discoveredAt),
    firstSeenAt:new Date(firstSeenAt??discoveredAt),
    lastSeenAt: new Date(lastSeenAt),
    ...(postedAt ? { postedAt: new Date(postedAt) } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
    ...(sourcePublishedAt?{sourcePublishedAt:new Date(sourcePublishedAt)}:{}),...(sourceUpdatedAt?{sourceUpdatedAt:new Date(sourceUpdatedAt)}:{}),
  };
};

export type JobListItem = {
  id: string; title: string; companyName: string; source: JobSourceProvider; sourceType:NormalizedJob["sourceType"];atsProvider:NormalizedJob["atsProvider"]; roleCategory: string; regions: RemoteRegion[]; freshness: FreshnessBucket;
  workplaceType: WorkplaceType; status: DiscoveryStatus; postedAt: Date | null; discoveredAt: Date; seniority: Seniority; minimumYearsExperience: number | null; maximumYearsExperience: number | null;
  duplicateSources: number; frontendClassification: NormalizedJob["frontendClassification"];
};
type SerializedJobListItem = Omit<JobListItem, "postedAt" | "discoveredAt"> & { postedAt: string | null; discoveredAt: string };
type SerializedJobIndex = { version: 4; items: SerializedJobListItem[] };
const jobListItem = (job: NormalizedJob): JobListItem => ({ id: job.id ?? job.descriptionHash, title: job.title, companyName: job.companyName, source: job.source,sourceType:job.sourceType,atsProvider:job.atsProvider, roleCategory: job.roleCategory ?? classifyRoleCategory(job.title), regions: job.remoteRegions, freshness: job.freshness, workplaceType: job.workplaceType, status: job.status, postedAt: job.postedAt ?? null, discoveredAt: job.discoveredAt, seniority: job.seniority ?? extractExperienceRequirement(job.title, job.description).seniority, minimumYearsExperience: job.minimumYearsExperience ?? null, maximumYearsExperience: job.maximumYearsExperience ?? null, duplicateSources: job.sourceReferences.length, frontendClassification: job.frontendClassification });
const serializedJobListItem = (job: JobListItem): SerializedJobListItem => ({ ...job, postedAt: job.postedAt?.toISOString() ?? null, discoveredAt: job.discoveredAt.toISOString() });
const saveJobIndex = (userId: string, jobs: NormalizedJob[]) => writeJson(jobsIndexFile(userId), { version: 4, items: jobs.map(jobListItem).map(serializedJobListItem) } satisfies SerializedJobIndex);

export async function readLocalJobSummaries(userId: string): Promise<JobListItem[]> {
  const index = await readJson<SerializedJobIndex | SerializedJobListItem[]>(jobsIndexFile(userId), []);
  const raw = !Array.isArray(index) && index.version === 4 ? index.items : [];
  if (raw.length) return raw.map((item) => ({ ...item, postedAt: item.postedAt ? new Date(item.postedAt) : null, discoveredAt: new Date(item.discoveredAt) }));
  const jobs = await readLocalJobs(userId);
  await saveJobIndex(userId, jobs);
  return jobs.map(jobListItem);
}

export async function readLocalJobById(userId: string, id: string): Promise<NormalizedJob | null> {
  const cached = await readJson<SerializedJob | null>(jobDetailFile(userId, id), null);
  if (cached) return hydrateJob(cached);
  const jobs = await readLocalJobs(userId);
  const job = jobs.find((item) => (item.id ?? item.descriptionHash) === id) ?? null;
  if (job) await writeJson(jobDetailFile(userId, id), job);
  return job;
}

export async function readLocalJobs(userId: string): Promise<NormalizedJob[]> {
  const raw = await readJson<Array<Parameters<typeof hydrateJob>[0]>>(jobsFile(userId), []);
  return raw.map(hydrateJob).sort((left, right) => (right.postedAt?.getTime() ?? -1) - (left.postedAt?.getTime() ?? -1));
}

export type JobPersistenceSourceStats={created:number;updated:number;unchanged:number;duplicates:number};
export async function upsertLocalJobs(userId: string, incoming: NormalizedJob[]): Promise<{ jobs: NormalizedJob[]; created: number; updated: number; unchanged:number; duplicates: number;createdJobIds:string[];bySource:Partial<Record<JobSourceProvider,JobPersistenceSourceStats>> }> {
  const existing = await readLocalJobs(userId);
  let created = 0; let updated = 0;let unchanged=0; let duplicates = 0;const createdJobIds:string[]=[];const bySource:Partial<Record<JobSourceProvider,JobPersistenceSourceStats>>={};
  for (const candidate of incoming) {
    const stats=bySource[candidate.source]??{created:0,updated:0,unchanged:0,duplicates:0};bySource[candidate.source]=stats;
    const index = existing.findIndex((job) => (job.atsProvider!=="UNKNOWN"&&candidate.atsProvider===job.atsProvider&&Boolean(job.atsJobId)&&job.atsJobId===candidate.atsJobId) || job.canonicalUrl.toLowerCase() === candidate.canonicalUrl.toLowerCase() || job.dedupeFingerprint === candidate.dedupeFingerprint || job.sourceReferences.some((reference) => candidate.sourceReferences.some((next) => next.provider === reference.provider && next.sourceRecordId === reference.sourceRecordId)));
    if (index < 0) {const added=candidate.id ? candidate : { ...candidate, id: randomUUID() };existing.push(added);createdJobIds.push(added.id??added.descriptionHash); created += 1;stats.created+=1; continue; }
    const current = existing[index]!;
    const references = [...current.sourceReferences];
    for (const reference of candidate.sourceReferences) if (!references.some((item) => item.provider === reference.provider && item.sourceRecordId === reference.sourceRecordId)) { references.push(reference); duplicates += 1;stats.duplicates+=1; }
    const importantChanged=current.descriptionHash!==candidate.descriptionHash||current.applicationUrl!==candidate.applicationUrl||JSON.stringify(current.locations)!==JSON.stringify(candidate.locations)||current.minimumYearsExperience!==candidate.minimumYearsExperience||current.status!==candidate.status||current.classificationReason!==candidate.classificationReason;
    const rank=(job:NormalizedJob)=>job.sourceType==="DIRECT_ATS"?4:job.sourceType==="PUBLIC_API"?3:job.sourceType==="RSS"?2:1;const preferred=rank(candidate)>=rank(current)?candidate:current;
    existing[index] = { ...preferred, id: current.id ?? randomUUID(), discoveredAt: current.discoveredAt,firstSeenAt:current.firstSeenAt??current.discoveredAt, lastSeenAt: candidate.lastSeenAt, sourceReferences: references };
    if(importantChanged){updated += 1;stats.updated+=1;}else{unchanged+=1;stats.unchanged+=1;}
  }
  await Promise.all([writeJson(jobsFile(userId), existing), saveJobIndex(userId, existing), ...existing.map((job) => writeJson(jobDetailFile(userId, job.id ?? job.descriptionHash), job))]);
  return { jobs: existing, created, updated,unchanged, duplicates,createdJobIds,bySource };
}

export async function saveSourceRuns(userId: string, runs: SourceRunSummary[]) {
  const current = await readJson<SourceRunSummary[]>(runsFile(userId), []);
  await writeJson(runsFile(userId), [...runs, ...current].slice(0, 500));
}
export const readSourceRuns = (userId: string) => readJson<SourceRunSummary[]>(runsFile(userId), []);

export async function updateRegistryFromRuns(userId: string, runs: SourceRunSummary[]) {
  const records = await readJobSourceRegistry(userId);
  const now = new Date().toISOString();
  const updated = records.map((record) => {
    const run = runs.find((item) => item.sourceId === record.id || item.sourceId.endsWith(`:${record.boardIdentifier}`));
    if (!run) return record;
    if(run.skippedReason)return{...record,nextSyncAt:run.nextEligibleSync,health:run.health??record.health,updatedAt:now};
    if (run.error) return { ...record, lastFailedScan: run.finishedAt,lastSyncAt:run.finishedAt,lastLatencyMs:run.latencyMs,health:run.health??"FAILED" as const,errors:(record.errors??0)+1, lastError: run.error, updatedAt: now };
    const interval=record.minimumPollIntervalMinutes??60;const next = { ...record, lastSuccessfulScan: run.finishedAt,lastSyncAt:run.finishedAt,nextSyncAt:new Date(new Date(run.finishedAt).getTime()+interval*60_000).toISOString(),lastLatencyMs:run.latencyMs,recordsFetched:run.jobsFetched,newJobs:run.jobsCreated,updatedJobs:run.jobsUpdated,duplicates:run.duplicatesFound,errors:record.errors??0,health:"HEALTHY" as const, jobCount: run.jobsFetched, updatedAt: now };
    delete next.lastError;
    return next;
  });
  await writeJson(registryFile(userId), updated);
}

export const readAIProviderHealth = (userId: string) => readJson<AIProviderHealth[]>(healthFile(userId), []);
export const saveAIProviderHealth = (userId: string, health: AIProviderHealth[]) => writeJson(healthFile(userId), health);
export const readClassificationCache = (userId: string) => readJson<Record<string, AIJobClassification>>(classificationFile(userId), {});
export const saveClassificationCache = (userId: string, cache: Record<string, AIJobClassification>) => writeJson(classificationFile(userId), cache);
