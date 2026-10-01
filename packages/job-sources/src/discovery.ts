import { experienceCompatibility, hasSeniorityRiskWithoutExperience, isRegionEligible, roleMatchesTarget } from "./normalization";
import type { JobSourceAdapter, JobSourceRegistryRecord, JobTargetPreferences, NormalizedJob, SourceRunSummary } from "./types";

export type DiscoveryScanResult = { jobs: NormalizedJob[]; runs: SourceRunSummary[]; duplicatesFound: number };
export function sourcePollingDecision(source:Pick<JobSourceRegistryRecord,"enabled"|"nextSyncAt"|"cooldownUntil"|"health">,now=new Date(),force=false){if(!source.enabled)return{due:false as const,reason:"DISABLED" as const};if(source.cooldownUntil&&new Date(source.cooldownUntil)>now)return{due:false as const,reason:"COOLDOWN" as const,nextEligibleSync:source.cooldownUntil};if(!force&&source.nextSyncAt&&new Date(source.nextSyncAt)>now)return{due:false as const,reason:"NOT_DUE" as const,nextEligibleSync:source.nextSyncAt};return{due:true as const};}

export function filterDiscoveredJob(job: NormalizedJob, allowedRegions: string[], target?: JobTargetPreferences): NormalizedJob {
  if (job.workplaceType === "HYBRID" || job.workplaceType === "ONSITE") return { ...job, status: "REJECTED_NOT_REMOTE", classificationReason: `${job.workplaceType} jobs are blocked by the remote-only preference.` };
  if (target) {
    const roleMatch = roleMatchesTarget(job.title, job.roleCategory, target.selectedRoleTitle, target.roleCategory, target.relatedTitles, target.includeRelatedTitles, job.description);
    if (roleMatch === false) return { ...job, status: "REJECTED_TARGET_ROLE", classificationReason: `TARGET_ROLE_MISMATCH: the role does not match the selected ${target.selectedRoleTitle} target.` };
    if (roleMatch === null) return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "The mixed or broad job title is an ambiguous target match and requires classification." };
    if (hasSeniorityRiskWithoutExperience(job)) return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "SENIORITY_RISK: the seniority title has no reliable explicit experience requirement (EXPERIENCE_UNKNOWN)." };
    if (job.workplaceType === "UNKNOWN") return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "The target role matches, but workplace type is genuinely unknown." };
    const regionEligible = isRegionEligible(job.remoteRegions, allowedRegions);
    if (regionEligible === false) return { ...job, status: "REJECTED_LOCATION", classificationReason: "The explicit remote geography is outside the candidate's allowed regions." };
    const experience = experienceCompatibility(target.candidateYearsExperience, job.minimumYearsExperience, target.experienceToleranceYears);
    if (experience === "MAJOR_MISMATCH") return { ...job, status: "REJECTED_EXPERIENCE", classificationReason: `The role requires substantially more than ${target.candidateYearsExperience} years of experience.` };
    if (regionEligible === null) return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "Remote geography needs classification." };
    return { ...job, status: "QUALIFIED_BY_FILTER", classificationReason: experience === "SLIGHTLY_ABOVE" ? "Target role match; experience requirement is slightly above the preference." : "Target role, location, and experience filters passed deterministically." };
  }
  if (job.workplaceType === "UNKNOWN") return { ...job, status: "NEEDS_CLASSIFICATION", classificationReason: "Workplace type requires classification." };
  const regionEligible = isRegionEligible(job.remoteRegions, allowedRegions);
  if (regionEligible === false) return { ...job, status: "REJECTED_LOCATION", classificationReason: "The explicit remote geography is outside the candidate's allowed regions." };
  if (job.frontendClassification === "NOT_FRONTEND") return { ...job, status: "REJECTED_ROLE" };
  if (regionEligible === null || job.frontendClassification === "AMBIGUOUS") return { ...job, status: "NEEDS_CLASSIFICATION" };
  return { ...job, status: "QUALIFIED_BY_FILTER" };
}

export function deduplicateJobs(jobs: NormalizedJob[]): { jobs: NormalizedJob[]; duplicates: number } {
  const canonical = new Map<string, NormalizedJob>();
  const identityIndex = new Map<string, string>();
  let duplicates = 0;
  for (const job of jobs) {
    const atsKey=job.atsProvider&&job.atsProvider!=="UNKNOWN"&&job.atsJobId?`ats:${job.atsProvider}:${job.atsJobId}`:undefined;
    const keys=[atsKey,`url:${job.canonicalUrl.toLowerCase()}`,`fingerprint:${job.dedupeFingerprint}`].filter((value):value is string=>Boolean(value));
    const strongKey=atsKey??`url:${job.canonicalUrl.toLowerCase()}`;
    const existingKey=keys.map((key)=>identityIndex.get(key)).find((key):key is string=>Boolean(key));
    if (!existingKey) {
      canonical.set(strongKey, job);
      keys.forEach((key)=>identityIndex.set(key,strongKey));
      continue;
    }
    const existing = canonical.get(existingKey);
    if (!existing) continue;
    duplicates += 1;
    const references = [...existing.sourceReferences];
    for (const reference of job.sourceReferences) if (!references.some((item) => item.provider === reference.provider && item.sourceRecordId === reference.sourceRecordId)) references.push(reference);
    const rank=(value:NormalizedJob)=>value.sourceType==="DIRECT_ATS"?4:value.sourceType==="PUBLIC_API"?3:value.sourceType==="RSS"?2:1;
    const preferred=rank(job)>rank(existing)?job:existing;
    canonical.set(existingKey, { ...preferred,...(existing.id??job.id?{id:existing.id??job.id}:{}),discoveredAt:existing.discoveredAt<job.discoveredAt?existing.discoveredAt:job.discoveredAt,firstSeenAt:(existing.firstSeenAt??existing.discoveredAt)<(job.firstSeenAt??job.discoveredAt)?existing.firstSeenAt??existing.discoveredAt:job.firstSeenAt??job.discoveredAt, sourceReferences: references, lastSeenAt: job.lastSeenAt > existing.lastSeenAt ? job.lastSeenAt : existing.lastSeenAt });
    keys.forEach((key)=>identityIndex.set(key,existingKey));
  }
  return { jobs: [...canonical.values()], duplicates };
}

export class JobDiscoveryService {
  constructor(private readonly adapters: JobSourceAdapter[], private readonly allowedRegions: string[], private readonly target?: JobTargetPreferences) {}

  async scan(since?: Date): Promise<DiscoveryScanResult> {
    const results=await Promise.all(this.adapters.map(async(adapter)=>{
      const started = new Date();
      let fetched = 0;
      const filtered: NormalizedJob[] = [];
      try {
        const rawJobs = await adapter.searchJobs(since);
        fetched = rawJobs.length;
        for (const raw of rawJobs) filtered.push(filterDiscoveredJob(adapter.normalizeJob(raw, started), this.allowedRegions, this.target));
        const finished = new Date();
        return{jobs:filtered,run:{ sourceId: adapter.id, provider: adapter.provider,sourceType:adapter.sourceType,health:"HEALTHY" as const, startedAt: started.toISOString(), finishedAt: finished.toISOString(), jobsFetched: fetched, jobsCreated: filtered.length, jobsUpdated: 0, duplicatesFound: 0, jobsRejectedNonRemote: filtered.filter((job) => job.status === "REJECTED_NOT_REMOTE").length, jobsRejectedLocation: filtered.filter((job) => job.status === "REJECTED_LOCATION").length, jobsRejectedRole: filtered.filter((job) => job.status === "REJECTED_ROLE"||job.status==="REJECTED_TARGET_ROLE").length, ambiguousJobs: filtered.filter((job) => job.status === "NEEDS_CLASSIFICATION").length, latencyMs: finished.getTime() - started.getTime() } satisfies SourceRunSummary};
      } catch {
        const finished = new Date();
        return{jobs:[] as NormalizedJob[],run:{ sourceId: adapter.id, provider: adapter.provider,sourceType:adapter.sourceType,health:"FAILED", startedAt: started.toISOString(), finishedAt: finished.toISOString(), jobsFetched: fetched, jobsCreated: 0, jobsUpdated: 0, duplicatesFound: 0, jobsRejectedNonRemote: 0, jobsRejectedLocation: 0, jobsRejectedRole: 0, ambiguousJobs: 0, latencyMs: finished.getTime() - started.getTime(), error: "Source scan failed safely." } satisfies SourceRunSummary};
      }
    }));const collected=results.flatMap((result)=>result.jobs);const runs=results.map((result)=>result.run);
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
