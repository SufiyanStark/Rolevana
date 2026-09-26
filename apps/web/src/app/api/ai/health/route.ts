import { AIProviderDiagnostics, aiProviderIds, diagnosticConfigFromEnv, type DiagnosticProviderId } from "@rolevana/ai";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readAIProviderHealth, saveAIProviderHealth } from "@/lib/job-store";

const diagnostics = () => new AIProviderDiagnostics(diagnosticConfigFromEnv(process.env));
const sanitized = (providers: Awaited<ReturnType<AIProviderDiagnostics["diagnoseAll"]>>) => ({ providers, freeAiOnly: process.env.FREE_AI_ONLY !== "false", maxAiCostUsd: Number(process.env.MAX_AI_COST_USD ?? 0) });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cached = await readAIProviderHealth(user.id);
  return NextResponse.json(sanitized(cached));
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("provider") as DiagnosticProviderId | null;
  if (requested && !aiProviderIds.includes(requested)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const current = await readAIProviderHealth(user.id);
  const recent = current.find((item) => (!requested || item.provider === requested) && Date.now() - new Date(item.checkedAt).getTime() < 30_000);
  if (recent) return NextResponse.json({ ...sanitized(requested ? [recent] : current), cooldown: true }, { status: 429 });
  const checked = requested ? [await diagnostics().diagnose(requested)] : await diagnostics().diagnoseAll();
  const merged = [...current.filter((item) => !checked.some((next) => next.provider === item.provider)), ...checked];
  await saveAIProviderHealth(user.id, merged);
  return NextResponse.json(sanitized(checked));
}
