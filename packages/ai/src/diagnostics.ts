export const aiProviderIds = ["openrouter", "nvidia", "agent-router"] as const;
export type DiagnosticProviderId = typeof aiProviderIds[number];
export type AIProviderHealthStatus =
  | "NOT_CONFIGURED" | "CHECKING" | "AUTHENTICATED" | "WORKING" | "MODEL_NOT_CONFIGURED"
  | "AUTHENTICATED_MODEL_SELECTION_REQUIRED" | "FREE_MODEL_UNVERIFIED" | "PAID_MODEL_BLOCKED"
  | "INVALID_API_KEY" | "RATE_LIMITED" | "QUOTA_EXHAUSTED" | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE" | "WAITING_FOR_FREE_AI" | "ERROR";

export type AIProviderHealth = {
  provider: DiagnosticProviderId;
  configured: boolean;
  authenticated: boolean;
  status: AIProviderHealthStatus;
  model: string | null;
  freeVerified: boolean;
  inference: "PASS" | "FAIL" | "NOT_RUN";
  latencyMs: number | null;
  checkedAt: string;
  estimatedCostUsd: 0;
  availableModels?: string[];
  safeMessage?: string;
};

export type AIProviderDiagnosticConfig = {
  openrouterApiKey?: string;
  openrouterModel?: string;
  nvidiaApiKey?: string;
  nvidiaModel?: string;
  nvidiaFreeModels?: string[];
  agentRouterApiKey?: string;
  agentRouterModel?: string;
  agentRouterFreeModels?: string[];
  freeAiOnly: boolean;
  maxAiCostUsd: number;
};

type Fetch = typeof fetch;
type ModelRecord = { id?: string; pricing?: { prompt?: string | number; completion?: string | number } };
const nowIso = () => new Date().toISOString();
const splitAllowlist = (values?: string[]) => new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
const safeHealth = (provider: DiagnosticProviderId, update: Partial<AIProviderHealth>): AIProviderHealth => ({
  provider, configured: false, authenticated: false, status: "NOT_CONFIGURED", model: null, freeVerified: false,
  inference: "NOT_RUN", latencyMs: null, checkedAt: nowIso(), estimatedCostUsd: 0, ...update
});
const mapHttpStatus = (status: number): AIProviderHealthStatus => {
  if (status === 401 || status === 403) return "INVALID_API_KEY";
  if (status === 429) return "RATE_LIMITED";
  if (status === 402) return "QUOTA_EXHAUSTED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "ERROR";
};
const zeroPricing = (model?: ModelRecord | null) => model?.pricing !== undefined
  && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0;
const responseContent = (body: unknown): string => {
  const data = body as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
};
const hasCompletion = (body: unknown) => Array.isArray((body as { choices?: unknown[] }).choices) && ((body as { choices: unknown[] }).choices.length > 0);

async function jsonRequest(fetcher: Fetch, url: string, init: RequestInit, timeoutMs = 15_000): Promise<{ response: Response; body: unknown; latencyMs: number }> {
  const started = Date.now();
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  return { response, body, latencyMs: Date.now() - started };
}

export class AIProviderDiagnostics {
  constructor(private readonly config: AIProviderDiagnosticConfig, private readonly fetcher: Fetch = fetch) {}

  async diagnose(provider: DiagnosticProviderId): Promise<AIProviderHealth> {
    if (!this.config.freeAiOnly || this.config.maxAiCostUsd !== 0) return safeHealth(provider, { configured: true, status: "PAID_MODEL_BLOCKED", safeMessage: "Diagnostics require FREE_AI_ONLY=true and a zero AI budget." });
    try {
      if (provider === "openrouter") return await this.openRouter();
      if (provider === "nvidia") return await this.nvidia();
      return this.agentRouter();
    } catch (error) {
      const status = error instanceof DOMException && error.name === "TimeoutError" ? "PROVIDER_UNAVAILABLE" : "ERROR";
      return safeHealth(provider, { configured: this.isConfigured(provider), model: this.model(provider), status, safeMessage: "The provider diagnostic could not complete safely." });
    }
  }

  async diagnoseAll(): Promise<AIProviderHealth[]> {
    return Promise.all(aiProviderIds.map((provider) => this.diagnose(provider)));
  }

  private isConfigured(provider: DiagnosticProviderId) {
    return Boolean(provider === "openrouter" ? this.config.openrouterApiKey : provider === "nvidia" ? this.config.nvidiaApiKey : this.config.agentRouterApiKey);
  }
  private model(provider: DiagnosticProviderId) {
    return (provider === "openrouter" ? this.config.openrouterModel : provider === "nvidia" ? this.config.nvidiaModel : this.config.agentRouterModel) || null;
  }

  private async openRouter(): Promise<AIProviderHealth> {
    const apiKey = this.config.openrouterApiKey;
    const model = this.config.openrouterModel || "openrouter/free";
    if (!apiKey) return safeHealth("openrouter", { model, status: "NOT_CONFIGURED" });
    const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Rolevana AI Diagnostics" };
    const auth = await jsonRequest(this.fetcher, "https://openrouter.ai/api/v1/key", { headers });
    if (!auth.response.ok) return safeHealth("openrouter", { configured: true, model, status: mapHttpStatus(auth.response.status), latencyMs: auth.latencyMs });

    const metadata = await jsonRequest(this.fetcher, `https://openrouter.ai/api/v1/model/${model}`, { headers });
    if (!metadata.response.ok) return safeHealth("openrouter", { configured: true, authenticated: true, model, status: metadata.response.status === 404 ? "MODEL_UNAVAILABLE" : mapHttpStatus(metadata.response.status), latencyMs: auth.latencyMs + metadata.latencyMs });
    const record = (metadata.body as { data?: ModelRecord }).data;
    if (!zeroPricing(record)) {
      const pricingKnown = record?.pricing && record.pricing.prompt !== undefined && record.pricing.completion !== undefined;
      return safeHealth("openrouter", { configured: true, authenticated: true, model, status: pricingKnown ? "PAID_MODEL_BLOCKED" : "FREE_MODEL_UNVERIFIED", latencyMs: auth.latencyMs + metadata.latencyMs });
    }
    const inference = await jsonRequest(this.fetcher, "https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers, body: JSON.stringify({ model, messages: [{ role: "system", content: "Reply with exactly one token and no explanation." }, { role: "user", content: "ROLEVANA_OK" }], max_tokens: 32, temperature: 0 }) }, 25_000);
    if (!inference.response.ok) return safeHealth("openrouter", { configured: true, authenticated: true, model, freeVerified: true, status: mapHttpStatus(inference.response.status), latencyMs: auth.latencyMs + metadata.latencyMs + inference.latencyMs });
    const passed = responseContent(inference.body).includes("ROLEVANA_OK") || hasCompletion(inference.body);
    return safeHealth("openrouter", { configured: true, authenticated: true, model, freeVerified: true, status: passed ? "WORKING" : "ERROR", inference: passed ? "PASS" : "FAIL", latencyMs: auth.latencyMs + metadata.latencyMs + inference.latencyMs });
  }

  private async nvidia(): Promise<AIProviderHealth> {
    const apiKey = this.config.nvidiaApiKey;
    const model = this.config.nvidiaModel || null;
    if (!apiKey) return safeHealth("nvidia", { model, status: "NOT_CONFIGURED" });
    const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
    const models = await jsonRequest(this.fetcher, "https://integrate.api.nvidia.com/v1/models", { headers });
    if (!models.response.ok) return safeHealth("nvidia", { configured: true, model, status: mapHttpStatus(models.response.status), latencyMs: models.latencyMs });
    const ids = ((models.body as { data?: ModelRecord[] }).data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id));
    const deepSeekModels = ids.filter((id) => /deepseek/i.test(id)).slice(0, 20);
    if (!model) return safeHealth("nvidia", { configured: true, authenticated: true, model: null, status: "AUTHENTICATED_MODEL_SELECTION_REQUIRED", latencyMs: models.latencyMs, availableModels: deepSeekModels });
    if (!ids.includes(model)) return safeHealth("nvidia", { configured: true, authenticated: true, model, status: "MODEL_UNAVAILABLE", latencyMs: models.latencyMs, availableModels: deepSeekModels });
    if (!splitAllowlist(this.config.nvidiaFreeModels).has(model)) return safeHealth("nvidia", { configured: true, authenticated: true, model, status: "FREE_MODEL_UNVERIFIED", latencyMs: models.latencyMs, availableModels: deepSeekModels });
    const inference = await jsonRequest(this.fetcher, "https://integrate.api.nvidia.com/v1/chat/completions", { method: "POST", headers, body: JSON.stringify({ model, messages: [{ role: "user", content: "Return exactly: ROLEVANA_OK" }], max_tokens: 8, temperature: 0, stream: false }) }, 25_000);
    if (!inference.response.ok) return safeHealth("nvidia", { configured: true, authenticated: true, model, freeVerified: true, status: mapHttpStatus(inference.response.status), latencyMs: models.latencyMs + inference.latencyMs, availableModels: deepSeekModels });
    const passed = responseContent(inference.body).includes("ROLEVANA_OK") || hasCompletion(inference.body);
    return safeHealth("nvidia", { configured: true, authenticated: true, model, freeVerified: true, status: passed ? "WORKING" : "ERROR", inference: passed ? "PASS" : "FAIL", latencyMs: models.latencyMs + inference.latencyMs, availableModels: deepSeekModels });
  }

  private agentRouter(): AIProviderHealth {
    const configured = Boolean(this.config.agentRouterApiKey);
    const model = this.config.agentRouterModel || null;
    if (!configured) return safeHealth("agent-router", { model, status: "NOT_CONFIGURED" });
    if (!model) return safeHealth("agent-router", { configured: true, model, status: "MODEL_NOT_CONFIGURED", safeMessage: "No documented Agent Router endpoint or model is configured; no network request was made." });
    const allowlisted = splitAllowlist(this.config.agentRouterFreeModels).has(model);
    return safeHealth("agent-router", { configured: true, model, freeVerified: allowlisted, status: "FREE_MODEL_UNVERIFIED", safeMessage: "Agent Router transport is undocumented in this repository; no potentially billable request was made." });
  }
}

export function diagnosticConfigFromEnv(source: Record<string, string | undefined>): AIProviderDiagnosticConfig {
  const list = (value?: string) => value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  return {
    ...(source.OPENROUTER_API_KEY ? { openrouterApiKey: source.OPENROUTER_API_KEY } : {}), openrouterModel: source.OPENROUTER_MODEL || "openrouter/free",
    ...(source.NVIDIA_API_KEY ? { nvidiaApiKey: source.NVIDIA_API_KEY } : {}), ...(source.NVIDIA_MODEL ? { nvidiaModel: source.NVIDIA_MODEL } : {}), nvidiaFreeModels: list(source.NVIDIA_FREE_MODELS),
    ...(source.AGENT_ROUTER_API_KEY ? { agentRouterApiKey: source.AGENT_ROUTER_API_KEY } : {}), ...(source.AGENT_ROUTER_MODEL ? { agentRouterModel: source.AGENT_ROUTER_MODEL } : {}), agentRouterFreeModels: list(source.AGENT_ROUTER_FREE_MODELS),
    freeAiOnly: source.FREE_AI_ONLY !== "false", maxAiCostUsd: Number(source.MAX_AI_COST_USD ?? 0)
  };
}

export function sanitizeDiagnosticOutput(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "string" && /(?:sk-|nvapi-|bearer\s)/i.test(item) ? "[REDACTED]" : item);
}
