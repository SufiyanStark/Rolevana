import { z } from "zod";

const blankToUndefined = (value: unknown) => value === "" ? undefined : value;
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const optionalString = z.preprocess(blankToUndefined, z.string().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
  NVIDIA_MODEL: optionalString,
  NVIDIA_FREE_MODELS: z.string().default(""),
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
  AUTOPILOT_DISCOVERY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  JOB_SOURCE_BOARD_URLS: z.string().default(""),
  DAILY_APPLICATION_TARGET: z.coerce.number().int().min(1).max(250).default(100),
  MINIMUM_MATCH_SCORE: z.coerce.number().int().min(0).max(100).default(65),
  AI_JOB_ANALYSIS_BATCH_SIZE: z.coerce.number().int().min(1).max(25).default(10),
  TAILORED_RESUME_RETENTION_DAYS: z.coerce.number().int().min(1).default(60)
}).superRefine((env, context) => {
  if (env.FREE_AI_ONLY && env.MAX_AI_COST_USD !== 0) context.addIssue({ code: "custom", path: ["MAX_AI_COST_USD"], message: "MAX_AI_COST_USD must be 0 when FREE_AI_ONLY is enabled." });
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
    scanIntervalMinutes: env.JOB_SCAN_INTERVAL_MINUTES,
    autopilotDiscovery: env.AUTOPILOT_DISCOVERY,
    minimumMatchScore: env.MINIMUM_MATCH_SCORE,
    aiJobAnalysisBatchSize: env.AI_JOB_ANALYSIS_BATCH_SIZE,
    tailoredResumeRetentionDays: env.TAILORED_RESUME_RETENTION_DAYS
  } as const;
};
