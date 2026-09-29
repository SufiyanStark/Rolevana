import { z } from "zod";

const blankToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const optionalString = z.preprocess(blankToUndefined, z.string().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ROLEVANA_USAGE_MODE: z.enum(["DEVELOPMENT", "PRODUCTION"]).default("DEVELOPMENT"),
  DRY_RUN: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FREE_AI_ONLY: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  FREE_INFRA_MODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  MAX_AI_COST_USD: z.coerce.number().min(0).default(0),
  DATABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: z.string().default("openrouter/free"),
  NVIDIA_API_KEY: optionalString,
  NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_MODEL: optionalString,
  NVIDIA_ULTRA_MODEL: z.string().default("nvidia/nemotron-3-ultra-550b-a55b"),
  NVIDIA_DEEPSEEK_MODEL: z.string().default("deepseek-ai/deepseek-v4.1-flash"),
  NVIDIA_CODER_MODEL: z.string().default("deepseek-ai/deepseek-coder-6.7b-instruct"),
  NVIDIA_REASONING_MODEL: z.string().default("nvidia/nemotron-3-super-120b-a12b"),
  NVIDIA_FREE_MODELS: z.string().default(""),
  NVIDIA_DEVELOPMENT_MODELS: z.string().default("nvidia/nemotron-3-ultra-550b-a55b"),
  OVH_AI_BASE_URL: optionalUrl,
  OVH_AI_MODEL: optionalString,
  OVH_AI_FREE_MODELS: z.string().default(""),
  LLM7_BASE_URL: z.string().url().default("https://api.llm7.io/v1"),
  LLM7_MODEL: optionalString,
  LLM7_FREE_MODELS: z.string().default(""),
  KILO_BASE_URL: optionalUrl,
  KILO_MODEL: optionalString,
  KILO_FREE_MODELS: z.string().default(""),
  GROQ_API_KEY: optionalString,
  GOOGLE_GEMINI_API_KEY: optionalString,
  CLOUDFLARE_API_TOKEN: optionalString,
  AGENT_ROUTER_API_KEY: optionalString,
  AGENT_ROUTER_MODEL: optionalString,
  AGENT_ROUTER_FREE_MODELS: z.string().default(""),
  AI_PROVIDER: z.enum(["mock", "openrouter", "nvidia", "agent-router"]).default("mock"),
  AI_FALLBACK_PROVIDER: z.enum(["mock", "openrouter", "nvidia", "agent-router"]).default("mock"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,
  REDIS_URL: optionalString,
  APP_URL: optionalUrl,
  ENCRYPTION_KEY: optionalString,
  JOB_SCAN_INTERVAL_MINUTES: z.coerce.number().int().min(15).default(60),
  AUTO_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(15).default(60),
  AUTOPILOT_DISCOVERY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  JOB_SOURCE_BOARD_URLS: z.string().default(""),
  DAILY_APPLICATION_TARGET: z.coerce.number().int().min(1).max(250).default(100),
  TARGET_APPLICATIONS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(10),
  ROLEVANA_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  MINIMUM_MATCH_SCORE: z.coerce.number().int().min(0).max(100).default(75),
  AI_JOB_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(10),
  TAILORED_RESUME_RETENTION_DAYS: z.coerce.number().int().min(1).default(60)
}).superRefine((env, context) => {
  if (env.FREE_AI_ONLY && env.MAX_AI_COST_USD !== 0) context.addIssue({ code: "custom", path: ["MAX_AI_COST_USD"], message: "MAX_AI_COST_USD must be 0 when FREE_AI_ONLY is enabled." });
  if (env.ROLEVANA_USAGE_MODE === "PRODUCTION" && env.NVIDIA_DEVELOPMENT_MODELS.trim()) context.addIssue({ code: "custom", path: ["NVIDIA_DEVELOPMENT_MODELS"], message: "Development-only NVIDIA endpoints cannot be enabled in production mode." });
});

export type AppEnv = z.infer<typeof envSchema>;
export const parseEnv = (source: Record<string, string | undefined>): AppEnv => envSchema.parse(source);

export const publicRuntimeConfig = (source: Record<string, string | undefined>) => {
  const env = parseEnv(source);
  return {
    dryRun: env.DRY_RUN,
    freeAiOnly: env.FREE_AI_ONLY,
    freeInfraMode: env.FREE_INFRA_MODE,
    maxAiCostUsd: env.MAX_AI_COST_USD,
    dailyApplicationTarget: env.DAILY_APPLICATION_TARGET,
    hourlyProcessingTarget: env.TARGET_APPLICATIONS_PER_HOUR,
    workerConcurrency: env.ROLEVANA_WORKER_CONCURRENCY,
    autoSyncIntervalMinutes: env.AUTO_SYNC_INTERVAL_MINUTES,
    scanIntervalMinutes: env.JOB_SCAN_INTERVAL_MINUTES,
    autopilotDiscovery: env.AUTOPILOT_DISCOVERY,
    minimumMatchScore: env.MINIMUM_MATCH_SCORE,
    aiJobAnalysisBatchSize: env.AI_JOB_ANALYSIS_BATCH_SIZE,
    tailoredResumeRetentionDays: env.TAILORED_RESUME_RETENTION_DAYS
  } as const;
};
