import { AshbyAdapter, GreenhouseAdapter, JobDiscoveryService, LeverAdapter, RemoteOKAdapter, type JobSourceAdapter, type JobSourceRegistryRecord, type NormalizedJob } from "@rolevana/job-sources";
import { readLocalProfile } from "./local-store";
import { readJobSourceRegistry, saveSourceRuns, updateRegistryFromRuns, upsertLocalJobs } from "./job-store";
import { classifyAmbiguousJobs } from "./ai-classification";
import { findRole } from "@rolevana/domain";

function adapterFor(record: JobSourceRegistryRecord): JobSourceAdapter | null {
  if (record.provider === "REMOTE_OK") return new RemoteOKAdapter();
  if (record.provider === "ASHBY") return new AshbyAdapter(record.companyName, record.boardIdentifier);
  if (record.provider === "GREENHOUSE") return new GreenhouseAdapter(record.companyName, record.boardIdentifier);
  if (record.provider === "LEVER") return new LeverAdapter(record.companyName, record.boardIdentifier, record.baseUrl);
  return null;
}

export async function runJobDiscovery(userId: string, source?: string) {
  const [profile, registry] = await Promise.all([readLocalProfile(userId), readJobSourceRegistry(userId)]);
  const sourceKey = source?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const selected = registry.filter((record) => record.enabled && (!sourceKey || record.provider.toLowerCase().replace(/[^a-z0-9]/g, "") === sourceKey || record.id.toLowerCase().replace(/[^a-z0-9]/g, "") === sourceKey));
  const adapters = selected.map(adapterFor).filter((adapter): adapter is JobSourceAdapter => adapter !== null);
  const role = findRole(profile?.primaryTargetRoleTitle ?? "");
  const target = profile?.primaryTargetRoleTitle ? { selectedRoleTitle: profile.primaryTargetRoleTitle, roleCategory: profile.primaryTargetRoleCategory, relatedTitles: role?.relatedTitles ?? [], includeRelatedTitles: profile.includeRelatedTitles, candidateYearsExperience: profile.totalYearsExperience, experienceToleranceYears: profile.experienceToleranceYears } : undefined;
  const scan = await new JobDiscoveryService(adapters, profile?.allowedRegions ?? ["India", "Worldwide", "APAC"], target).scan();
  const classified = await classifyAmbiguousJobs(userId, scan.jobs, Number(process.env.AI_JOB_ANALYSIS_BATCH_SIZE ?? 10), target);
  const persisted = await upsertLocalJobs(userId, classified);
  const runs = scan.runs.map((run) => ({ ...run, jobsCreated: persisted.created, jobsUpdated: persisted.updated, duplicatesFound: run.duplicatesFound + scan.duplicatesFound + persisted.duplicates }));
  await Promise.all([saveSourceRuns(userId, runs), updateRegistryFromRuns(userId, runs)]);
  return { ...scan, runs, jobs: persisted.jobs, persistence: persisted, applicationsSubmitted: 0 as const, emailsSent: 0 as const, dryRun: true as const };
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

export function discoveryMetricsFromSummaries(items: Array<{ discoveredAt: Date | string; workplaceType: string; frontendClassification: string; status: string; duplicateSources: number }>, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const toDate = (v: Date | string) => v instanceof Date ? v : new Date(v);
  return {
    jobsDiscoveredToday: items.filter((i) => toDate(i.discoveredAt) >= today).length,
    newLastHour: items.filter((i) => now.getTime() - toDate(i.discoveredAt).getTime() < 3_600_000).length,
    remoteEligible: items.filter((i) => i.status === "QUALIFIED_BY_FILTER").length,
    needsClassification: items.filter((i) => i.status === "NEEDS_CLASSIFICATION" || i.status === "WAITING_FOR_FREE_AI").length,
    rejected: items.filter((i) => i.status.startsWith("REJECTED")).length,
    duplicates: items.filter((i) => i.duplicateSources > 1).length,
    total: items.length
  };
}
