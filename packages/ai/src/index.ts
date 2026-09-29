export type JobAnalysis = {
  matchScore: number;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  strengths: string[];
  concerns: string[];
  recommendationReason: string;
};

export interface AIProvider {
  readonly id: "mock" | "openrouter" | "nvidia" | "ovh" | "llm7" | "kilo" | "groq" | "gemini" | "cloudflare" | "agent-router";
  readonly model: string;
  classifyJob(description: string): Promise<{ frontendRelevant: boolean; remote: boolean }>;
  classifyJobs?(jobs: AIJobClassificationInput[]): Promise<AIJobClassification[]>;
  calculateJobMatch(description: string, candidateFacts: string): Promise<JobAnalysis>;
  extractJobRequirements(description: string): Promise<{ required: string[]; preferred: string[] }>;
  tailorResume(description: string, sourceOfTruth: string): Promise<string>;
  answerApplicationQuestion(question: string, candidateFacts: string): Promise<string>;
  generateCoverLetter(description: string, candidateFacts: string): Promise<string>;
  generateApplicationEmail(description: string, candidateFacts: string): Promise<{ subject: string; body: string }>;
  summarizeJob(description: string): Promise<string>;
  identifyRiskyQuestion(question: string): Promise<boolean>;
  completeStructured?(prompt: string, options?: StructuredCompletionOptions): Promise<StructuredCompletionResult>;
}

export type StructuredCompletionOptions = { enableThinking?: boolean; temperature?: number; topP?: number; maxTokens?: number; timeoutMs?: number };
export type StructuredCompletionResult = { content: string; latencyMs: number; resolvedModel?: string; reasoningAvailable?: boolean; usage?: { promptTokens?: number|undefined; completionTokens?: number|undefined; totalTokens?: number|undefined } };

export type AIJobClassificationInput = { jobId: string; title: string; description: string; locations: string[]; targetRole?: string; targetRoleCategory?: string };
export type AIJobClassification = {
  jobId: string;
  frontendClassification: "FRONTEND" | "FRONTEND_HEAVY" | "NOT_FRONTEND" | "UNCERTAIN";
  remoteClassification: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
  targetRoleMatch?: "MATCH" | "NO_MATCH" | "UNCERTAIN";
  reason: string;
};

export type FreeAIWaitStatus =
  | "FREE_PROVIDER_RATE_LIMITED"
  | "FREE_MODEL_UNAVAILABLE"
  | "FREE_PROVIDER_QUOTA_EXHAUSTED"
  | "NO_FREE_MODEL_AVAILABLE"
  | "WAITING_FOR_FREE_AI";

export type ModelPricing = {
  inputUsdPerMillionTokens: number | null;
  outputUsdPerMillionTokens: number | null;
  verifiedAt: Date | null;
  source: "PROVIDER_METADATA" | "TRUSTED_ALLOWLIST" | "OFFICIAL_DEVELOPMENT_ENTITLEMENT" | "BUILT_IN_FREE_ALIAS" | "UNKNOWN";
};

export type FreeProviderCandidate = {
  provider: AIProvider;
  pricing: ModelPricing;
  entitlement?: ProviderEntitlement;
  usageMode?: "DEVELOPMENT" | "PRODUCTION";
};

export type ProviderEntitlement = "FREE_DEVELOPMENT_ENDPOINT" | "FREE_PRODUCTION_ENDPOINT" | "PAID_OR_UNKNOWN";

export class BillableModelBlockedError extends Error {
  readonly code = "PAID_SERVICE_REQUIRED";
  constructor(readonly provider: string, readonly model: string) {
    super(`${provider}/${model} is unavailable because Rolevana is configured to use free AI only.`);
  }
}

export class WaitingForFreeAIError extends Error {
  readonly code = "WAITING_FOR_FREE_AI";
  constructor(readonly reasons: FreeAIWaitStatus[]) {
    super("No verified free AI provider is currently available. The task must wait for free capacity.");
  }
}

export class FreeProviderUnavailableError extends Error {
  constructor(readonly status: Exclude<FreeAIWaitStatus, "NO_FREE_MODEL_AVAILABLE" | "WAITING_FOR_FREE_AI">, message: string) { super(message); }
}

export function assertFreeModel(candidate: FreeProviderCandidate): void {
  const { provider, pricing, entitlement, usageMode } = candidate;
  if (entitlement === "FREE_DEVELOPMENT_ENDPOINT" && usageMode === "PRODUCTION") throw new BillableModelBlockedError(provider.id, provider.model);
  if (entitlement === "PAID_OR_UNKNOWN") throw new BillableModelBlockedError(provider.id, provider.model);
  const verified = pricing.verifiedAt !== null && pricing.source !== "UNKNOWN";
  if (!verified || pricing.inputUsdPerMillionTokens !== 0 || pricing.outputUsdPerMillionTokens !== 0) {
    throw new BillableModelBlockedError(provider.id, provider.model);
  }
}

type ProviderOperation<T> = (provider: AIProvider) => Promise<T>;
export class FreeAIProviderRouter {
  constructor(
    private readonly candidates: FreeProviderCandidate[],
    private readonly queueForLater: (status: "WAITING_FOR_FREE_AI", reasons: FreeAIWaitStatus[]) => Promise<void> = async () => undefined
  ) {}

  async execute<T>(operation: ProviderOperation<T>): Promise<T> {
    const reasons: FreeAIWaitStatus[] = [];
    for (const candidate of this.candidates) {
      try {
        assertFreeModel(candidate);
      } catch (error) {
        if (error instanceof BillableModelBlockedError) { reasons.push("NO_FREE_MODEL_AVAILABLE"); continue; }
        throw error;
      }
      try {
        return await operation(candidate.provider);
      } catch (error) {
        if (error instanceof FreeProviderUnavailableError) { reasons.push(error.status); continue; }
        throw error;
      }
    }
    reasons.push("WAITING_FOR_FREE_AI");
    await this.queueForLater("WAITING_FOR_FREE_AI", reasons);
    throw new WaitingForFreeAIError(reasons);
  }
}

export type AITaskType = "JOB_ROLE_CLASSIFICATION" | "LOCATION_CLASSIFICATION" | "JD_EXTRACTION" | "MATCH_REASONING" | "RESUME_TAILORING" | "TRUTHFULNESS_REVIEW" | "ATS_VALIDATION";
export type AIPrivacyClass = "PUBLIC_JOB_DATA" | "SANITIZED_CANDIDATE_DATA" | "SENSITIVE_CANDIDATE_DATA";
export type ProviderRuntimeState = { healthy: boolean; lastSuccess?: string; lastError?: string; latencyMs?: number; retryAfter?: string; estimatedQuotaUsage?: number; cooldownUntil?: string };
export type AICapability = "HIGH_REASONING" | "LONG_CONTEXT" | "CODING" | "FAST" | "STRUCTURED_OUTPUT";
export type RoutedProviderCandidate = FreeProviderCandidate & { allowedPrivacyClasses: AIPrivacyClass[]; tasks?: AITaskType[]; capabilities?: AICapability[]; capacity?: number; state?: ProviderRuntimeState };
export class PrivacyAwareFreeAIProviderRouter {
  private readonly active = new Map<string, number>();
  constructor(private readonly candidates: RoutedProviderCandidate[], private readonly now: () => Date = () => new Date()) {}
  async execute<T>(task: AITaskType, privacyClass: AIPrivacyClass, operation: ProviderOperation<T>, requiredCapabilities: AICapability[] = []): Promise<{ value: T; provider: string; model: string; fallbackCount: number }> {
    let fallbackCount = 0; const reasons: FreeAIWaitStatus[] = [];
    for (const candidate of this.candidates) {
      if (!candidate.allowedPrivacyClasses.includes(privacyClass) || (candidate.tasks && !candidate.tasks.includes(task)) || requiredCapabilities.some((capability) => !candidate.capabilities?.includes(capability))) continue;
      try { assertFreeModel(candidate); } catch { reasons.push("NO_FREE_MODEL_AVAILABLE"); fallbackCount += 1; continue; }
      const state = candidate.state; if (state?.cooldownUntil && new Date(state.cooldownUntil) > this.now()) { reasons.push("FREE_PROVIDER_RATE_LIMITED"); fallbackCount += 1; continue; }
      const key = `${candidate.provider.id}/${candidate.provider.model}`; const active = this.active.get(key) ?? 0;
      if (active >= (candidate.capacity ?? 1)) { reasons.push("FREE_PROVIDER_RATE_LIMITED"); fallbackCount += 1; continue; }
      this.active.set(key, active + 1);
      try { const value = await operation(candidate.provider); return { value, provider: candidate.provider.id, model: candidate.provider.model, fallbackCount }; }
      catch (error) { if (error instanceof FreeProviderUnavailableError) { reasons.push(error.status); fallbackCount += 1; continue; } throw error; }
      finally { this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1)); }
    }
    throw new WaitingForFreeAIError([...reasons, "WAITING_FOR_FREE_AI"]);
  }
}

export const verifiedFreePricing = (source: ModelPricing["source"] = "TRUSTED_ALLOWLIST"): ModelPricing => ({
  inputUsdPerMillionTokens: 0,
  outputUsdPerMillionTokens: 0,
  verifiedAt: new Date(),
  source
});

export const unknownPricing = (): ModelPricing => ({ inputUsdPerMillionTokens: null, outputUsdPerMillionTokens: null, verifiedAt: null, source: "UNKNOWN" });

export function normalizeJobDescription(description: string): string {
  return description.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function stableJobDescriptionHash(description: string): string {
  const normalized = normalizeJobDescription(description);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface AIResultCache<T> {
  get(operation: string, contentHash: string): Promise<T | null>;
  set(operation: string, contentHash: string, value: T): Promise<void>;
}

export class MemoryAIResultCache<T> implements AIResultCache<T> {
  private readonly values = new Map<string, T>();
  async get(operation: string, contentHash: string) { return this.values.get(`${operation}:${contentHash}`) ?? null; }
  async set(operation: string, contentHash: string, value: T) { this.values.set(`${operation}:${contentHash}`, value); }
}

export function chunkForAI<T>(items: T[], batchSize: number): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("AI batch size must be a positive integer.");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) batches.push(items.slice(index, index + batchSize));
  return batches;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) { super(`${provider} is not configured. Add its API key before selecting it.`); }
}

abstract class PlaceholderProvider implements AIProvider {
  abstract readonly id: AIProvider["id"];
  constructor(readonly model: string, protected readonly apiKey?: string, protected readonly fetcher: typeof fetch = fetch) {}
  protected assertConfigured() { if (!this.apiKey) throw new ProviderNotConfiguredError(this.id); }
  async classifyJob(_description: string): Promise<{ frontendRelevant: boolean; remote: boolean }> { this.assertConfigured(); throw new Error("Provider transport is scheduled for Phase 3"); }
  async calculateJobMatch(_description: string, _candidateFacts: string): Promise<JobAnalysis> { this.assertConfigured(); throw new Error("Provider transport is scheduled for Phase 3"); }
  async extractJobRequirements(_description: string): Promise<{ required: string[]; preferred: string[] }> { this.assertConfigured(); throw new Error("Provider transport is scheduled for Phase 3"); }
  async tailorResume(_description: string, _sourceOfTruth: string): Promise<string> { this.assertConfigured(); throw new Error("Resume tailoring is scheduled for Phase 4"); }
  async answerApplicationQuestion(_question: string, _candidateFacts: string): Promise<string> { this.assertConfigured(); throw new Error("Application answers are scheduled for Phase 5"); }
  async generateCoverLetter(_description: string, _candidateFacts: string): Promise<string> { this.assertConfigured(); throw new Error("Cover letters are scheduled for Phase 5"); }
  async generateApplicationEmail(_description: string, _candidateFacts: string): Promise<{ subject: string; body: string }> { this.assertConfigured(); throw new Error("Email applications are scheduled for Phase 6"); }
  async summarizeJob(_description: string): Promise<string> { this.assertConfigured(); throw new Error("Provider transport is scheduled for Phase 3"); }
  async identifyRiskyQuestion(_question: string): Promise<boolean> { this.assertConfigured(); throw new Error("Risk classification is scheduled for Phase 5"); }
}

const classificationPrompt = (jobs: AIJobClassificationInput[]) => `Classify only target-role relevance and workplace type. Return only a JSON array with jobId, targetRoleMatch (MATCH|NO_MATCH|UNCERTAIN), frontendClassification (FRONTEND|FRONTEND_HEAVY|NOT_FRONTEND|UNCERTAIN), remoteClassification (REMOTE|HYBRID|ONSITE|UNKNOWN), and a short reason. Jobs: ${JSON.stringify(jobs.map((job) => ({ ...job, description: job.description.slice(0, 4000) })))}`;
const parseClassifications = (body: unknown): AIJobClassification[] => {
  const content = (body as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI classification response was not valid structured JSON.");
  const parsed = JSON.parse(match[0]) as AIJobClassification[];
  return parsed.filter((item) => item && typeof item.jobId === "string" && typeof item.reason === "string");
};
async function providerClassification(fetcher: typeof fetch, url: string, apiKey: string|undefined, model: string, jobs: AIJobClassificationInput[]) {
  const response = await fetcher(url, { method: "POST", headers: { ...(apiKey?{authorization:`Bearer ${apiKey}`}:{ }), "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: classificationPrompt(jobs) }], max_tokens: Math.min(1200, 120 + jobs.length * 110), temperature: 0, stream: false }), signal: AbortSignal.timeout(30_000) });
  if (response.status === 429) throw new FreeProviderUnavailableError("FREE_PROVIDER_RATE_LIMITED", "The verified-free provider is rate limited.");
  if (response.status === 402) throw new FreeProviderUnavailableError("FREE_PROVIDER_QUOTA_EXHAUSTED", "The verified-free provider quota is exhausted.");
  if (!response.ok) throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE", "The verified-free provider is unavailable.");
  try { return parseClassifications(await response.json()); }
  catch { throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE", "The verified-free provider returned unusable classification output."); }
}
async function providerStructuredCompletion(fetcher: typeof fetch, url: string, apiKey: string|undefined, model: string, prompt: string, options:StructuredCompletionOptions={}) {
  const started=Date.now();
  let response:Response;try{response=await fetcher(url,{method:"POST",headers:{...(apiKey?{authorization:`Bearer ${apiKey}`}:{ }),"content-type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:"Return only valid JSON. Begin the response immediately with { and provide no analysis, markdown, or preamble. Never invent candidate facts, metrics, dates, employers, titles, or skills. Use only supplied evidence IDs."},{role:"user",content:prompt}],max_tokens:options.maxTokens??4800,temperature:options.temperature??0,top_p:options.topP??0.95,...(options.enableThinking===undefined?{}:{chat_template_kwargs:{enable_thinking:options.enableThinking}}),stream:false}),signal:AbortSignal.timeout(options.timeoutMs??45_000)});}catch(error){if(error instanceof DOMException&&error.name==="TimeoutError")throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","The verified-free provider timed out.");throw error;}
  if(response.status===429)throw new FreeProviderUnavailableError("FREE_PROVIDER_RATE_LIMITED","The verified-free provider is rate limited.");
  if(response.status===402)throw new FreeProviderUnavailableError("FREE_PROVIDER_QUOTA_EXHAUSTED","The verified-free provider quota is exhausted.");
  if(!response.ok)throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE",`The verified-free provider returned ${response.status}.`);
  const body=await response.json() as {model?:string;usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number};choices?:Array<{message?:{content?:string;reasoning_content?:string}}>};const message=body.choices?.[0]?.message;const content=message?.content?.trim();
  if(!content)throw new FreeProviderUnavailableError("FREE_MODEL_UNAVAILABLE","The verified-free provider returned no structured content.");
  return{content,latencyMs:Date.now()-started,...(body.model?{resolvedModel:body.model}:{}),reasoningAvailable:Boolean(message?.reasoning_content),...(body.usage?{usage:{promptTokens:body.usage.prompt_tokens,completionTokens:body.usage.completion_tokens,totalTokens:body.usage.total_tokens}}:{})};
}

export class OpenRouterProvider extends PlaceholderProvider {
  readonly id = "openrouter" as const;
  constructor(model: string, apiKey?: string, fetcher?: typeof fetch) { super(model, apiKey, fetcher); }
  async classifyJobs(jobs: AIJobClassificationInput[]) { this.assertConfigured(); return providerClassification(this.fetcher, "https://openrouter.ai/api/v1/chat/completions", this.apiKey!, this.model, jobs); }
  override async classifyJob(description: string) { const [result] = await this.classifyJobs([{ jobId: "job", title: "", description, locations: [] }]); return { frontendRelevant: result?.frontendClassification === "FRONTEND" || result?.frontendClassification === "FRONTEND_HEAVY", remote: result?.remoteClassification === "REMOTE" }; }
  completeStructured(prompt:string){this.assertConfigured();return providerStructuredCompletion(this.fetcher,"https://openrouter.ai/api/v1/chat/completions",this.apiKey!,this.model,prompt);}
}
export class NvidiaProvider extends PlaceholderProvider {
  readonly id = "nvidia" as const;
  constructor(model: string, apiKey?: string, fetcher?: typeof fetch,private readonly baseUrl="https://integrate.api.nvidia.com/v1") { super(model, apiKey, fetcher); }
  async classifyJobs(jobs: AIJobClassificationInput[]) { this.assertConfigured(); return providerClassification(this.fetcher, `${this.baseUrl.replace(/\/$/,"")}/chat/completions`, this.apiKey!, this.model, jobs); }
  override async classifyJob(description: string) { const [result] = await this.classifyJobs([{ jobId: "job", title: "", description, locations: [] }]); return { frontendRelevant: result?.frontendClassification === "FRONTEND" || result?.frontendClassification === "FRONTEND_HEAVY", remote: result?.remoteClassification === "REMOTE" }; }
  completeStructured(prompt:string,options:StructuredCompletionOptions={}){this.assertConfigured();return providerStructuredCompletion(this.fetcher,`${this.baseUrl.replace(/\/$/,"")}/chat/completions`,this.apiKey!,this.model,prompt,options);}
}
export type NvidiaModelSlots = { deepseek: string; coder: string; reasoning: string };
export function selectNvidiaModel(task: AITaskType, slots: NvidiaModelSlots) {
  if (task === "JD_EXTRACTION") return slots.coder;
  if (task === "RESUME_TAILORING" || task === "TRUTHFULNESS_REVIEW" || task === "ATS_VALIDATION") return slots.reasoning;
  return slots.deepseek;
}
abstract class PublicOnlyOpenAICompatibleProvider extends PlaceholderProvider {
  abstract readonly id: "ovh" | "llm7" | "kilo";
  constructor(model: string, private readonly baseUrl: string, apiKey?: string, fetcher?: typeof fetch) { super(model, apiKey, fetcher); }
  async classifyJobs(jobs: AIJobClassificationInput[]) { return providerClassification(this.fetcher, `${this.baseUrl.replace(/\/$/, "")}/chat/completions`, this.apiKey!, this.model, jobs); }
  override async classifyJob(description: string) { const [result] = await this.classifyJobs([{ jobId:"job",title:"",description,locations:[] }]); return { frontendRelevant: result?.frontendClassification === "FRONTEND" || result?.frontendClassification === "FRONTEND_HEAVY", remote: result?.remoteClassification === "REMOTE" }; }
  completeStructured(prompt:string){return providerStructuredCompletion(this.fetcher,`${this.baseUrl.replace(/\/$/,"")}/chat/completions`,this.apiKey!,this.model,prompt);}
}
export class OVHProvider extends PublicOnlyOpenAICompatibleProvider { readonly id = "ovh" as const; constructor(model: string, baseUrl: string, apiKey?: string, fetcher?: typeof fetch) { super(model, baseUrl, apiKey, fetcher); } }
export class LLM7Provider extends PublicOnlyOpenAICompatibleProvider { readonly id = "llm7" as const; constructor(model: string, baseUrl = "https://api.llm7.io/v1", fetcher?: typeof fetch) { super(model, baseUrl, undefined, fetcher); } }
export class KiloProvider extends PublicOnlyOpenAICompatibleProvider { readonly id = "kilo" as const; constructor(model: string, baseUrl: string, fetcher?: typeof fetch) { super(model, baseUrl, undefined, fetcher); } }
export class AgentRouterProvider extends PlaceholderProvider {
  readonly id = "agent-router" as const;
  constructor(model: string, apiKey?: string) { super(model, apiKey); }
}

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model = "deterministic-phase-1";
  async classifyJob(description: string) { const text = description.toLowerCase(); return { frontendRelevant: /react|frontend|typescript/.test(text), remote: /remote/.test(text) }; }
  async classifyJobs(jobs: AIJobClassificationInput[]) { return Promise.all(jobs.map(async (job) => { const result = await this.classifyJob(`${job.title} ${job.description}`); const target = job.targetRole?.toLowerCase() ?? "frontend"; const targetRoleMatch = `${job.title} ${job.description}`.toLowerCase().includes(target.split(" ")[0] ?? target) ? "MATCH" as const : "UNCERTAIN" as const; return { jobId: job.jobId, targetRoleMatch, frontendClassification: result.frontendRelevant ? "FRONTEND" as const : "NOT_FRONTEND" as const, remoteClassification: result.remote ? "REMOTE" as const : "UNKNOWN" as const, reason: "Deterministic mock classification." }; })); }
  async calculateJobMatch(): Promise<JobAnalysis> { return { matchScore: 82, matchedSkills: ["React", "TypeScript"], missingRequiredSkills: [], missingPreferredSkills: ["GraphQL"], strengths: ["Strong frontend alignment"], concerns: [], recommendationReason: "Mock qualified job for local development." }; }
  async extractJobRequirements() { return { required: ["React", "TypeScript"], preferred: ["GraphQL"] }; }
  async tailorResume(_description: string, sourceOfTruth: string) { return sourceOfTruth; }
  async answerApplicationQuestion(_question: string, candidateFacts: string) { return candidateFacts.slice(0, 240); }
  async generateCoverLetter() { return "Dry-run cover letter."; }
  async generateApplicationEmail() { return { subject: "Dry-run application", body: "This message was generated in dry-run mode and was not sent." }; }
  async summarizeJob(description: string) { return description.slice(0, 200); }
  async identifyRiskyQuestion(question: string) { return /visa|salary|criminal|legal|sponsor/i.test(question); }
}

export * from "./diagnostics";
