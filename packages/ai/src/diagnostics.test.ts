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

  it("rejects the invalid NVIDIA alias deepseek even when the catalog is reachable",async()=>{const fetcher=vi.fn().mockResolvedValue(json({data:[{id:"deepseek-ai/deepseek-v4.1-flash"}]}));const result=await new AIProviderDiagnostics(diagnosticConfigFromEnv({...base,NVIDIA_API_KEY:"nvapi-test",NVIDIA_MODEL:"deepseek",NVIDIA_FREE_MODELS:"deepseek"}),fetcher).diagnose("nvidia");expect(result.status).toBe("MODEL_UNAVAILABLE");});

  it("requires an exact NVIDIA free allowlist before inference",async()=>{const fetcher=vi.fn().mockResolvedValue(json({data:[{id:"deepseek-ai/deepseek-v4.1-flash"}]}));const result=await new AIProviderDiagnostics(diagnosticConfigFromEnv({...base,NVIDIA_API_KEY:"nvapi-test",NVIDIA_MODEL:"deepseek-ai/deepseek-v4.1-flash",NVIDIA_FREE_MODELS:""}),fetcher).diagnose("nvidia");expect(result.status).toBe("FREE_MODEL_UNVERIFIED");});

  it("verifies the exact NVIDIA Ultra development entitlement with a minimal probe",async()=>{const model="nvidia/nemotron-3-ultra-550b-a55b";const fetcher=vi.fn().mockResolvedValueOnce(json({data:[{id:model}]})).mockResolvedValueOnce(json({model,choices:[{message:{content:"ROLEVANA_OK"}}]}));const result=await new AIProviderDiagnostics(diagnosticConfigFromEnv({...base,NVIDIA_API_KEY:"nvapi-test",NVIDIA_MODEL:model,NVIDIA_ULTRA_MODEL:model,NVIDIA_DEVELOPMENT_MODELS:model,ROLEVANA_USAGE_MODE:"DEVELOPMENT"}),fetcher).diagnose("nvidia");expect(result).toMatchObject({status:"WORKING",freeVerified:true,entitlement:"FREE_DEVELOPMENT_ENDPOINT",environment:"DEVELOPMENT_ONLY",inference:"PASS"});expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({max_tokens:32,temperature:0,chat_template_kwargs:{enable_thinking:false},stream:false});});

  it("blocks development-only NVIDIA endpoints in production before inference",async()=>{const model="nvidia/nemotron-3-ultra-550b-a55b";const fetcher=vi.fn().mockResolvedValueOnce(json({data:[{id:model}]}));const result=await new AIProviderDiagnostics(diagnosticConfigFromEnv({...base,NVIDIA_API_KEY:"nvapi-test",NVIDIA_MODEL:model,NVIDIA_DEVELOPMENT_MODELS:model,ROLEVANA_USAGE_MODE:"PRODUCTION"}),fetcher).diagnose("nvidia");expect(result.status).toBe("PAID_MODEL_BLOCKED");expect(fetcher).toHaveBeenCalledTimes(1);});

  it("sanitizes secret-looking strings from diagnostic serialization", () => {
    expect(sanitizeDiagnosticOutput({ message: "Bearer sk-secret-value" })).not.toContain("sk-secret-value");
  });

  it.each(["ovh", "llm7", "kilo"] as const)("fails closed for an unconfigured %s keyless adapter", async (provider) => {
    const result = await new AIProviderDiagnostics(diagnosticConfigFromEnv(base), vi.fn()).diagnose(provider);
    expect(["NOT_CONFIGURED", "FREE_MODEL_UNVERIFIED"]).toContain(result.status);
    expect(result.privacyClasses).toEqual(["PUBLIC_JOB_DATA"]);
  });

  it.each(["groq", "gemini", "cloudflare"] as const)("keeps future %s provider non-blocking", async (provider) => {
    expect((await new AIProviderDiagnostics(diagnosticConfigFromEnv(base), vi.fn()).diagnose(provider)).status).toBe("NOT_CONFIGURED");
  });
});
