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
  readonly id: "mock" | "openrouter" | "nvidia" | "agent-router";
  readonly model: string;
  classifyJob(description: string): Promise<{ frontendRelevant: boolean; remote: boolean }>;
  calculateJobMatch(description: string, candidateFacts: string): Promise<JobAnalysis>;
  extractJobRequirements(description: string): Promise<{ required: string[]; preferred: string[] }>;
  tailorResume(description: string, sourceOfTruth: string): Promise<string>;
  answerApplicationQuestion(question: string, candidateFacts: string): Promise<string>;
  generateCoverLetter(description: string, candidateFacts: string): Promise<string>;
  generateApplicationEmail(description: string, candidateFacts: string): Promise<{ subject: string; body: string }>;
  summarizeJob(description: string): Promise<string>;
  identifyRiskyQuestion(question: string): Promise<boolean>;
}

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
  source: "PROVIDER_METADATA" | "TRUSTED_ALLOWLIST" | "BUILT_IN_FREE_ALIAS" | "UNKNOWN";
};

export type FreeProviderCandidate = {
  provider: AIProvider;
  pricing: ModelPricing;
};

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
  const { provider, pricing } = candidate;
  const builtInOpenRouterAlias = provider.id === "openrouter" && provider.model === "openrouter/free";
  if (builtInOpenRouterAlias) return;
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
  constructor(readonly model: string, private readonly apiKey?: string) {}
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

export class OpenRouterProvider extends PlaceholderProvider {
  readonly id = "openrouter" as const;
  constructor(model: string, apiKey?: string) { super(model, apiKey); }
}
export class NvidiaProvider extends PlaceholderProvider {
  readonly id = "nvidia" as const;
  constructor(model: string, apiKey?: string) { super(model, apiKey); }
}
export class AgentRouterProvider extends PlaceholderProvider {
  readonly id = "agent-router" as const;
  constructor(model: string, apiKey?: string) { super(model, apiKey); }
}

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model = "deterministic-phase-1";
  async classifyJob(description: string) { const text = description.toLowerCase(); return { frontendRelevant: /react|frontend|typescript/.test(text), remote: /remote/.test(text) }; }
  async calculateJobMatch(): Promise<JobAnalysis> { return { matchScore: 82, matchedSkills: ["React", "TypeScript"], missingRequiredSkills: [], missingPreferredSkills: ["GraphQL"], strengths: ["Strong frontend alignment"], concerns: [], recommendationReason: "Mock qualified job for local development." }; }
  async extractJobRequirements() { return { required: ["React", "TypeScript"], preferred: ["GraphQL"] }; }
  async tailorResume(_description: string, sourceOfTruth: string) { return sourceOfTruth; }
  async answerApplicationQuestion(_question: string, candidateFacts: string) { return candidateFacts.slice(0, 240); }
  async generateCoverLetter() { return "Dry-run cover letter."; }
  async generateApplicationEmail() { return { subject: "Dry-run application", body: "This message was generated in dry-run mode and was not sent." }; }
  async summarizeJob(description: string) { return description.slice(0, 200); }
  async identifyRiskyQuestion(question: string) { return /visa|salary|criminal|legal|sponsor/i.test(question); }
}
