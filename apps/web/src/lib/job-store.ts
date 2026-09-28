import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getLocalDataDirectory } from "./local-store";
import { classifyRoleCategory, extractExperienceRequirement, normalizeRemoteRegions, parseSupportedBoardUrl, type DiscoveryStatus, type FreshnessBucket, type JobSourceProvider, type JobSourceRegistryRecord, type NormalizedJob, type RemoteRegion, type Seniority, type SourceRunSummary, type WorkplaceType } from "@rolevana/job-sources";
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
  const remote: JobSourceRegistryRecord = { id: "remote-ok", provider: "REMOTE_OK", companyName: "Remote OK", boardIdentifier: "remote-ok", baseUrl: "https://remoteok.com/api", enabled: true, jobCount: 0, createdAt: now, updatedAt: now };
  const seeds = (process.env.JOB_SOURCE_BOARD_URLS ?? "").split(",").map((value) => value.trim()).filter(Boolean).flatMap((boardUrl) => {
    const parsed = parseSupportedBoardUrl(boardUrl);
    if (!parsed) return [];
    return [{ id: `${parsed.provider.toLowerCase()}:${parsed.boardIdentifier}`, provider: parsed.provider, companyName: parsed.boardIdentifier, boardIdentifier: parsed.boardIdentifier, ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}), enabled: true, jobCount: 0, createdAt: now, updatedAt: now } satisfies JobSourceRegistryRecord];
  });
  return [remote, ...seeds];
};

export async function readJobSourceRegistry(userId: string): Promise<JobSourceRegistryRecord[]> {
  const records = await readJson<JobSourceRegistryRecord[]>(registryFile(userId), []);
  if (records.length) return records;
  const defaults = defaultRegistry(); await writeJson(registryFile(userId), defaults); return defaults;
}

export async function addJobSourceFromUrl(userId: string, companyName: string, boardUrl: string): Promise<JobSourceRegistryRecord> {
  const parsed = parseSupportedBoardUrl(boardUrl);
  if (!parsed) throw new Error("UNSUPPORTED_SOURCE");
  const records = await readJobSourceRegistry(userId);
  const existing = records.find((record) => record.provider === parsed.provider && record.boardIdentifier === parsed.boardIdentifier);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record: JobSourceRegistryRecord = { id: randomUUID(), provider: parsed.provider, companyName: companyName.trim() || parsed.boardIdentifier, boardIdentifier: parsed.boardIdentifier, ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}), enabled: true, jobCount: 0, createdAt: now, updatedAt: now };
  await writeJson(registryFile(userId), [...records, record]);
  return record;
}

export async function setJobSourceEnabled(userId: string, id: string, enabled: boolean) {
  const records = await readJobSourceRegistry(userId);
  const updated = records.map((record) => record.id === id ? { ...record, enabled, updatedAt: new Date().toISOString() } : record);
  await writeJson(registryFile(userId), updated);
  return updated.find((record) => record.id === id) ?? null;
}

type SerializedJob = Omit<NormalizedJob, "postedAt" | "updatedAt" | "discoveredAt" | "lastSeenAt"> & {
  postedAt?: string;
  updatedAt?: string;
  discoveredAt: string;
  lastSeenAt: string;
};

const hydrateJob = (raw: SerializedJob): NormalizedJob => {
  const { postedAt, updatedAt, discoveredAt, lastSeenAt, ...rest } = raw;
  const experience = extractExperienceRequirement(rest.title, rest.description);
  const invalidStoredExperience = rest.maximumYearsExperience !== undefined && (rest.maximumYearsExperience > 30 || (rest.minimumYearsExperience !== undefined && rest.minimumYearsExperience > rest.maximumYearsExperience));
  return {
    ...rest,
    ...(invalidStoredExperience ? { minimumYearsExperience: experience.minimumYearsExperience, maximumYearsExperience: experience.maximumYearsExperience } : {}),
    remoteRegions: rest.remoteRegions.includes("UNKNOWN") ? normalizeRemoteRegions(rest.locations.join(" "), rest.locationRestrictions.join(" ")) : rest.remoteRegions,
    roleCategory: rest.roleCategory ?? classifyRoleCategory(rest.title),
    seniority: rest.seniority ?? experience.seniority,
    ...(rest.minimumYearsExperience === undefined && experience.minimumYearsExperience !== undefined ? { minimumYearsExperience: experience.minimumYearsExperience } : {}),
    ...(rest.maximumYearsExperience === undefined && experience.maximumYearsExperience !== undefined ? { maximumYearsExperience: experience.maximumYearsExperience } : {}),
    discoveredAt: new Date(discoveredAt),
    lastSeenAt: new Date(lastSeenAt),
    ...(postedAt ? { postedAt: new Date(postedAt) } : {}),
    ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}),
  };
};

export type JobListItem = {
  id: string; title: string; companyName: string; source: JobSourceProvider; roleCategory: string; regions: RemoteRegion[]; freshness: FreshnessBucket;
  workplaceType: WorkplaceType; status: DiscoveryStatus; postedAt: Date | null; discoveredAt: Date; seniority: Seniority; minimumYearsExperience: number | null; maximumYearsExperience: number | null;
  duplicateSources: number; frontendClassification: NormalizedJob["frontendClassification"];
};
type SerializedJobListItem = Omit<JobListItem, "postedAt" | "discoveredAt"> & { postedAt: string | null; discoveredAt: string };
type SerializedJobIndex = { version: 4; items: SerializedJobListItem[] };
const jobListItem = (job: NormalizedJob): JobListItem => ({ id: job.id ?? job.descriptionHash, title: job.title, companyName: job.companyName, source: job.source, roleCategory: job.roleCategory ?? classifyRoleCategory(job.title), regions: job.remoteRegions, freshness: job.freshness, workplaceType: job.workplaceType, status: job.status, postedAt: job.postedAt ?? null, discoveredAt: job.discoveredAt, seniority: job.seniority ?? extractExperienceRequirement(job.title, job.description).seniority, minimumYearsExperience: job.minimumYearsExperience ?? null, maximumYearsExperience: job.maximumYearsExperience ?? null, duplicateSources: job.sourceReferences.length, frontendClassification: job.frontendClassification });
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

export async function upsertLocalJobs(userId: string, incoming: NormalizedJob[]): Promise<{ jobs: NormalizedJob[]; created: number; updated: number; duplicates: number }> {
  const existing = await readLocalJobs(userId);
  let created = 0; let updated = 0; let duplicates = 0;
  for (const candidate of incoming) {
    const index = existing.findIndex((job) => job.canonicalUrl.toLowerCase() === candidate.canonicalUrl.toLowerCase() || job.dedupeFingerprint === candidate.dedupeFingerprint || job.sourceReferences.some((reference) => candidate.sourceReferences.some((next) => next.provider === reference.provider && next.sourceRecordId === reference.sourceRecordId)));
    if (index < 0) { existing.push(candidate.id ? candidate : { ...candidate, id: randomUUID() }); created += 1; continue; }
    const current = existing[index]!;
    const references = [...current.sourceReferences];
    for (const reference of candidate.sourceReferences) if (!references.some((item) => item.provider === reference.provider && item.sourceRecordId === reference.sourceRecordId)) { references.push(reference); duplicates += 1; }
    existing[index] = { ...current, ...candidate, id: current.id ?? randomUUID(), discoveredAt: current.discoveredAt, lastSeenAt: candidate.lastSeenAt, sourceReferences: references };
    updated += 1;
  }
  await Promise.all([writeJson(jobsFile(userId), existing), saveJobIndex(userId, existing), ...existing.map((job) => writeJson(jobDetailFile(userId, job.id ?? job.descriptionHash), job))]);
  return { jobs: existing, created, updated, duplicates };
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
    if (run.error) return { ...record, lastFailedScan: run.finishedAt, lastError: run.error, updatedAt: now };
    const next = { ...record, lastSuccessfulScan: run.finishedAt, jobCount: run.jobsFetched, updatedAt: now };
    delete next.lastError;
    return next;
  });
  await writeJson(registryFile(userId), updated);
}

export const readAIProviderHealth = (userId: string) => readJson<AIProviderHealth[]>(healthFile(userId), []);
export const saveAIProviderHealth = (userId: string, health: AIProviderHealth[]) => writeJson(healthFile(userId), health);
export const readClassificationCache = (userId: string) => readJson<Record<string, AIJobClassification>>(classificationFile(userId), {});
export const saveClassificationCache = (userId: string, cache: Record<string, AIJobClassification>) => writeJson(classificationFile(userId), cache);
