import { FreeAIProviderRouter, KiloProvider, NvidiaProvider, OpenRouterProvider, WaitingForFreeAIError, chunkForAI, stableJobDescriptionHash, verifiedFreePricing, type AIJobClassification, type FreeProviderCandidate } from "@rolevana/ai";
import { roleMatchesTarget, type JobTargetPreferences, type NormalizedJob } from "@rolevana/job-sources";
import { readAIProviderHealth, readClassificationCache, saveClassificationCache } from "./job-store";

export async function classifyAmbiguousJobs(userId: string, jobs: NormalizedJob[], batchSize: number, target?: JobTargetPreferences): Promise<NormalizedJob[]> {
  const ambiguous = jobs.filter((job) => {
    if (job.status !== "NEEDS_CLASSIFICATION") return false;
    if (!target) return job.frontendClassification === "AMBIGUOUS";
    return roleMatchesTarget(job.title, job.roleCategory, target.selectedRoleTitle, target.roleCategory, target.relatedTitles, target.includeRelatedTitles) === null;
  });
  if (!ambiguous.length) return jobs;
  const [health, cache] = await Promise.all([readAIProviderHealth(userId), readClassificationCache(userId)]);
  const candidates: FreeProviderCandidate[] = [];
  const kilo=health.find((entry)=>entry.provider==="kilo"&&entry.status==="WORKING"&&entry.freeVerified&&entry.model);
  if(kilo?.model&&process.env.KILO_BASE_URL)candidates.push({provider:new KiloProvider(kilo.model,process.env.KILO_BASE_URL),pricing:verifiedFreePricing("PROVIDER_METADATA")});
  for (const item of health.filter((entry) => entry.status === "WORKING" && entry.freeVerified && entry.model)) {
    if (item.provider === "openrouter" && process.env.OPENROUTER_API_KEY) candidates.push({ provider: new OpenRouterProvider(item.model!, process.env.OPENROUTER_API_KEY), pricing: verifiedFreePricing("PROVIDER_METADATA") });
    if (item.provider === "nvidia" && process.env.NVIDIA_API_KEY) candidates.push({ provider: new NvidiaProvider(item.model!, process.env.NVIDIA_API_KEY), pricing: verifiedFreePricing("TRUSTED_ALLOWLIST") });
  }
  const router = new FreeAIProviderRouter(candidates);
  const results = new Map<string, AIJobClassification>();
  const cacheKey = (job: NormalizedJob) => `${job.descriptionHash}:${target?.roleCategory ?? "frontend"}`;
  const uncached = ambiguous.filter((job) => { const key = cacheKey(job); const cached = cache[key]; if (cached) results.set(key, cached); return !cached; });
  for (const batch of chunkForAI(uncached, batchSize)) {
    try {
      const classified = await router.execute(async (provider) => {
        if (!provider.classifyJobs) throw new Error("Provider does not support batch classification.");
        return provider.classifyJobs(batch.map((job) => ({ jobId: cacheKey(job), title: job.title, description: job.description, locations: job.locations, ...(target ? { targetRole: target.selectedRoleTitle, targetRoleCategory: target.roleCategory } : {}) })));
      });
      for (const result of classified) { results.set(result.jobId, result); cache[result.jobId] = result; }
    } catch (error) {
      if (!(error instanceof WaitingForFreeAIError)) throw error;
    }
  }
  await saveClassificationCache(userId, cache);
  return jobs.map((job) => {
    if (job.status !== "NEEDS_CLASSIFICATION") return job;
    const result = results.get(`${stableJobDescriptionHash(job.description)}:${target?.roleCategory ?? "frontend"}`);
    if (!result) return { ...job, status: "WAITING_FOR_FREE_AI", classificationReason: "No verified-free AI provider is currently available." };
    const frontendClassification = result.frontendClassification === "UNCERTAIN" ? "AMBIGUOUS" : result.frontendClassification;
    if (result.remoteClassification === "HYBRID" || result.remoteClassification === "ONSITE") return { ...job, workplaceType: result.remoteClassification, frontendClassification, status: "REJECTED_NOT_REMOTE", classificationReason: result.reason };
    if (target && result.targetRoleMatch === "NO_MATCH") return { ...job, frontendClassification, status: "REJECTED_TARGET_ROLE", classificationReason: result.reason };
    if (!target && frontendClassification === "NOT_FRONTEND") return { ...job, frontendClassification, status: "REJECTED_ROLE", classificationReason: result.reason };
    if (result.remoteClassification === "REMOTE" && (target ? result.targetRoleMatch === "MATCH" : frontendClassification !== "AMBIGUOUS")) return { ...job, workplaceType: "REMOTE", frontendClassification, status: "QUALIFIED_BY_FILTER", classificationReason: result.reason };
    return { ...job, frontendClassification, status: "NEEDS_CLASSIFICATION", classificationReason: result.reason };
  });
}
