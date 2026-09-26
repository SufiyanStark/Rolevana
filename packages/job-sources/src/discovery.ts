import { experienceCompatibility, isRegionEligible, roleMatchesTarget } from "./normalization";
import type { JobSourceAdapter, JobTargetPreferences, NormalizedJob, SourceRunSummary } from "./types";

export type DiscoveryScanResult = { jobs: NormalizedJob[]; runs: SourceRunSummary[]; duplicatesFound: number };

export function filterDiscoveredJob(job: NormalizedJob, allowedRegions: string[], target?: JobTargetPreferences): NormalizedJob {
  if (job.workplaceType === "HYBRID" || job.workplaceType === "ONSITE") return { ...job, status: "REJECTED_NOT_REMOTE", classificationReason: `${job.workplaceType} jobs are blocked by the remote-only preference.` };
  if (job.workplaceType === "UNKNOWN") return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "Workplace type requires classification." };
  const regionEligible = isRegionEligible(job.remoteRegions, allowedRegions);
  if (regionEligible === false) return { ...job, status: "REJECTED_LOCATION", classificationReason: "The explicit remote geography is outside the candidate's allowed regions." };
  if (target) {
    const roleMatch = roleMatchesTarget(job.title, job.roleCategory, target.selectedRoleTitle, target.roleCategory, target.relatedTitles, target.includeRelatedTitles);
    if (roleMatch === false) return { ...job, status: "REJECTED_TARGET_ROLE", classificationReason: `The role does not match the selected ${target.selectedRoleTitle} target.` };
    if (roleMatch === null) return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "The broad job title needs target-role classification." };
    const experience = experienceCompatibility(target.candidateYearsExperience, job.minimumYearsExperience, target.experienceToleranceYears);
    if (experience === "MAJOR_MISMATCH") return { ...job, status: "REJECTED_EXPERIENCE", classificationReason: `The role requires substantially more than ${target.candidateYearsExperience} years of experience.` };
    if (regionEligible === null) return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "Remote geography needs classification." };
    return { ...job, status: "QUALIFIED_BY_FILTER", classificationReason: experience === "SLIGHTLY_ABOVE" ? "Target role match; experience requirement is slightly above the preference." : "Target role, location, and experience filters passed deterministically." };
  }
  if (job.frontendClassification === "NOT_FRONTEND") return { ...job, status: "REJECTED_ROLE" };
  if (regionEligible === null || job.frontendClassification === "AMBIGUOUS") return { ...job, status: "NEEDS_CLASSIFICATION" };
  return { ...job, status: "QUALIFIED_BY_FILTER" };
}

export function deduplicateJobs(jobs: NormalizedJob[]): { jobs: NormalizedJob[]; duplicates: number } {
  const canonical = new Map<string, NormalizedJob>();
  const fingerprintIndex = new Map<string, string>();
  let duplicates = 0;
  for (const job of jobs) {
    const strongKey = job.canonicalUrl.toLowerCase();
    const existingKey = canonical.has(strongKey) ? strongKey : fingerprintIndex.get(job.dedupeFingerprint);
    if (!existingKey) {
      canonical.set(strongKey, job);
      fingerprintIndex.set(job.dedupeFingerprint, strongKey);
      continue;
    }
    const existing = canonical.get(existingKey);
    if (!existing) continue;
    duplicates += 1;
    const references = [...existing.sourceReferences];
    for (const reference of job.sourceReferences) if (!references.some((item) => item.provider === reference.provider && item.sourceRecordId === reference.sourceRecordId)) references.push(reference);
    canonical.set(existingKey, { ...existing, sourceReferences: references, lastSeenAt: job.lastSeenAt > existing.lastSeenAt ? job.lastSeenAt : existing.lastSeenAt });
  }
  return { jobs: [...canonical.values()], duplicates };
}

export class JobDiscoveryService {
  constructor(private readonly adapters: JobSourceAdapter[], private readonly allowedRegions: string[], private readonly target?: JobTargetPreferences) {}

  async scan(since?: Date): Promise<DiscoveryScanResult> {
    const collected: NormalizedJob[] = [];
    const runs: SourceRunSummary[] = [];
    for (const adapter of this.adapters) {
      const started = new Date();
      let fetched = 0;
      const filtered: NormalizedJob[] = [];
      try {
        const rawJobs = await adapter.searchJobs(since);
        fetched = rawJobs.length;
        for (const raw of rawJobs) filtered.push(filterDiscoveredJob(adapter.normalizeJob(raw, started), this.allowedRegions, this.target));
        collected.push(...filtered);
        const finished = new Date();
        runs.push({ sourceId: adapter.id, provider: adapter.provider, startedAt: started.toISOString(), finishedAt: finished.toISOString(), jobsFetched: fetched, jobsCreated: filtered.length, jobsUpdated: 0, duplicatesFound: 0, jobsRejectedNonRemote: filtered.filter((job) => job.status === "REJECTED_NOT_REMOTE").length, jobsRejectedLocation: filtered.filter((job) => job.status === "REJECTED_LOCATION").length, jobsRejectedRole: filtered.filter((job) => job.status === "REJECTED_ROLE").length, ambiguousJobs: filtered.filter((job) => job.status === "NEEDS_CLASSIFICATION").length, latencyMs: finished.getTime() - started.getTime() });
      } catch {
        const finished = new Date();
        runs.push({ sourceId: adapter.id, provider: adapter.provider, startedAt: started.toISOString(), finishedAt: finished.toISOString(), jobsFetched: fetched, jobsCreated: 0, jobsUpdated: 0, duplicatesFound: 0, jobsRejectedNonRemote: 0, jobsRejectedLocation: 0, jobsRejectedRole: 0, ambiguousJobs: 0, latencyMs: finished.getTime() - started.getTime(), error: "Source scan failed safely." });
      }
    }
    const deduplicated = deduplicateJobs(collected);
    return { jobs: deduplicated.jobs.sort((left, right) => (right.postedAt?.getTime() ?? -1) - (left.postedAt?.getTime() ?? -1)), runs, duplicatesFound: deduplicated.duplicates };
  }
}

export class NonOverlappingDiscoveryScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  constructor(private readonly scan: () => Promise<void>, readonly intervalMinutes = 60) {}
  start() { if (!this.timer) this.timer = setInterval(() => { void this.tick(); }, this.intervalMinutes * 60_000); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async tick(): Promise<boolean> { if (this.running) return false; this.running = true; try { await this.scan(); return true; } finally { this.running = false; } }
  get isRunning() { return this.running; }
}
