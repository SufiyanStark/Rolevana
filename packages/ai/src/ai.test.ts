import { describe, expect, it } from "vitest";
import { BillableModelBlockedError, FreeAIProviderRouter, FreeProviderUnavailableError, MemoryAIResultCache, MockAIProvider, OpenRouterProvider, WaitingForFreeAIError, assertFreeModel, chunkForAI, stableJobDescriptionHash, unknownPricing, verifiedFreePricing } from "./index";
describe("AI providers", () => {
  it("keeps the mock deterministic", async () => expect((await new MockAIProvider().calculateJobMatch()).matchScore).toBe(82));
  it("fails clearly when a vendor is not configured", async () => await expect(new OpenRouterProvider("model").classifyJob("job")).rejects.toThrow(/not configured/));
  it("blocks unknown-cost models before they can run", () => expect(() => assertFreeModel({ provider: new OpenRouterProvider("paid-or-unknown", "key"), pricing: unknownPricing() })).toThrow(BillableModelBlockedError));
  it("allows the OpenRouter free alias only after zero pricing is verified", () => expect(() => assertFreeModel({ provider: new OpenRouterProvider("openrouter/free", "key"), pricing: verifiedFreePricing("PROVIDER_METADATA") })).not.toThrow());
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
});
