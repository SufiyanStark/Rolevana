import { describe, expect, it, vi } from "vitest";
import { AIProviderDiagnostics, diagnosticConfigFromEnv, sanitizeDiagnosticOutput } from "./diagnostics";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const base = { OPENROUTER_MODEL: "openrouter/free", FREE_AI_ONLY: "true", MAX_AI_COST_USD: "0" };

describe("AI provider diagnostics", () => {
  it("reports a missing API key as not configured", async () => {
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv(base), vi.fn()).diagnose("openrouter");
    expect(result.status).toBe("NOT_CONFIGURED");
  });

  it("reports an invalid API key without exposing it", async () => {
    const key = "sk-secret-value";
    const fetcher = vi.fn().mockResolvedValue(json({ error: "unauthorized" }, 401));
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv({ ...base, OPENROUTER_API_KEY: key }), fetcher).diagnose("openrouter");
    expect(result.status).toBe("INVALID_API_KEY");
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it("permits verified-zero OpenRouter metadata and runs one tiny inference", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ data: { is_free_tier: true } }))
      .mockResolvedValueOnce(json({ data: { id: "openrouter/free", pricing: { prompt: "0", completion: "0" } } }))
      .mockResolvedValueOnce(json({ choices: [{ message: { content: "ROLEVANA_OK" } }] }));
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv({ ...base, OPENROUTER_API_KEY: "sk-test" }), fetcher).diagnose("openrouter");
    expect(result).toMatchObject({ status: "WORKING", freeVerified: true, inference: "PASS", estimatedCostUsd: 0 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ prompt: "0.000001", completion: "0" }, "PAID_MODEL_BLOCKED"],
    [{}, "FREE_MODEL_UNVERIFIED"]
  ] as const)("blocks paid or unknown OpenRouter pricing before inference", async (pricing, status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ data: {} })).mockResolvedValueOnce(json({ data: { id: "model", pricing } }));
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv({ ...base, OPENROUTER_API_KEY: "sk-test", OPENROUTER_MODEL: "vendor/model" }), fetcher).diagnose("openrouter");
    expect(result.status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("authenticates NVIDIA but requires model selection when none is configured", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ data: [{ id: "deepseek-ai/deepseek-v3" }] }));
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv({ ...base, NVIDIA_API_KEY: "nvapi-test" }), fetcher).diagnose("nvidia");
    expect(result).toMatchObject({ status: "AUTHENTICATED_MODEL_SELECTION_REQUIRED", authenticated: true, availableModels: ["deepseek-ai/deepseek-v3"] });
  });

  it("sanitizes secret-looking strings from diagnostic serialization", () => {
    expect(sanitizeDiagnosticOutput({ message: "Bearer sk-secret-value" })).not.toContain("sk-secret-value");
  });
});
