import { describe, expect, it } from "vitest";
import { BillableModelBlockedError, FreeAIProviderRouter, FreeProviderUnavailableError, LLM7Provider, MemoryAIResultCache, MockAIProvider, OpenRouterProvider, PrivacyAwareFreeAIProviderRouter, WaitingForFreeAIError, assertFreeModel, chunkForAI, selectNvidiaModel, stableJobDescriptionHash, unknownPricing, verifiedFreePricing } from "./index";
describe("AI providers", () => {
  it("keeps the mock deterministic", async () => expect((await new MockAIProvider().calculateJobMatch()).matchScore).toBe(82));
  it("fails clearly when a vendor is not configured", async () => await expect(new OpenRouterProvider("model").classifyJob("job")).rejects.toThrow(/not configured/));
  it("blocks unknown-cost models before they can run", () => expect(() => assertFreeModel({ provider: new OpenRouterProvider("paid-or-unknown", "key"), pricing: unknownPricing() })).toThrow(BillableModelBlockedError));
  it("allows the OpenRouter free alias only after zero pricing is verified", () => expect(() => assertFreeModel({ provider: new OpenRouterProvider("openrouter/free", "key"), pricing: verifiedFreePricing("PROVIDER_METADATA") })).not.toThrow());
  it("allows development endpoints only outside production",()=>{const candidate={provider:new OpenRouterProvider("dev","key"),pricing:verifiedFreePricing("OFFICIAL_DEVELOPMENT_ENTITLEMENT"),entitlement:"FREE_DEVELOPMENT_ENDPOINT" as const};expect(()=>assertFreeModel({...candidate,usageMode:"DEVELOPMENT"})).not.toThrow();expect(()=>assertFreeModel({...candidate,usageMode:"PRODUCTION"})).toThrow(BillableModelBlockedError);});
  it("queues instead of falling back to a paid provider", async () => {
    const queued: string[] = [];
    const limited = new MockAIProvider();
    limited.classifyJob = async () => { throw new FreeProviderUnavailableError("FREE_PROVIDER_RATE_LIMITED", "limited"); };
    const router = new FreeAIProviderRouter([
      { provider: limited, pricing: verifiedFreePricing() },
      { provider: new OpenRouterProvider("billable", "key"), pricing: { ...verifiedFreePricing(), inputUsdPerMillionTokens: 1 } }
    ], async (status) => { queued.push(status); });
    await expect(router.execute((provider) => provider.classifyJob("remote react"))).rejects.toBeInstanceOf(WaitingForFreeAIError);
    expect(queued).toEqual(["WAITING_FOR_FREE_AI"]);
  });
  it("hashes normalized descriptions and creates bounded batches", () => {
    expect(stableJobDescriptionHash(" React   REMOTE ")).toBe(stableJobDescriptionHash("react remote"));
    expect(chunkForAI([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("caches classifications by normalized description hash", async () => {
    const cache = new MemoryAIResultCache<{ frontend: boolean }>();
    const hash = stableJobDescriptionHash("Remote React role");
    await cache.set("job-classification", hash, { frontend: true });
    expect(await cache.get("job-classification", stableJobDescriptionHash(" remote   react role "))).toEqual({ frontend: true });
  });
  it("selects NVIDIA models by task without coupling agents to providers", () => {
    const slots = { deepseek:"deepseek",coder:"coder",reasoning:"nemotron" };
    expect(selectNvidiaModel("MATCH_REASONING", slots)).toBe("deepseek");
    expect(selectNvidiaModel("JD_EXTRACTION", slots)).toBe("coder");
    expect(selectNvidiaModel("TRUTHFULNESS_REVIEW", slots)).toBe("nemotron");
  });
  it("restricts keyless providers to public job data and respects cooldown", async () => {
    const provider = new LLM7Provider("free"); provider.classifyJob = async () => ({frontendRelevant:true,remote:true});
    const router = new PrivacyAwareFreeAIProviderRouter([{provider,pricing:verifiedFreePricing(),allowedPrivacyClasses:["PUBLIC_JOB_DATA"],state:{healthy:true}}]);
    await expect(router.execute("JOB_ROLE_CLASSIFICATION","SANITIZED_CANDIDATE_DATA",(item)=>item.classifyJob("x"))).rejects.toBeInstanceOf(WaitingForFreeAIError);
    await expect(router.execute("JOB_ROLE_CLASSIFICATION","PUBLIC_JOB_DATA",(item)=>item.classifyJob("x"))).resolves.toMatchObject({provider:"llm7",fallbackCount:0});
  });
  it("falls back after 429 and queues when all verified-free providers are exhausted", async () => {
    const limited = new MockAIProvider(); limited.classifyJob = async () => { throw new FreeProviderUnavailableError("FREE_PROVIDER_RATE_LIMITED","429"); };
    const healthy = new MockAIProvider(); healthy.classifyJob = async () => ({frontendRelevant:true,remote:true});
    const router = new PrivacyAwareFreeAIProviderRouter([{provider:limited,pricing:verifiedFreePricing(),allowedPrivacyClasses:["PUBLIC_JOB_DATA"]},{provider:healthy,pricing:verifiedFreePricing(),allowedPrivacyClasses:["PUBLIC_JOB_DATA"]}]);
    await expect(router.execute("JOB_ROLE_CLASSIFICATION","PUBLIC_JOB_DATA",(item)=>item.classifyJob("x"))).resolves.toMatchObject({fallbackCount:1});
  });
});
