import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runJobDiscovery } from "@/lib/discovery";

let activeScan: Promise<Awaited<ReturnType<typeof runJobDiscovery>>> | null = null;
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.DRY_RUN !== "true") return NextResponse.json({ error: "Phase 2 discovery requires DRY_RUN=true." }, { status: 412 });
  if (activeScan) return NextResponse.json({ error: "A discovery scan is already running." }, { status: 409 });
  const source = new URL(request.url).searchParams.get("source") || undefined;
  activeScan = runJobDiscovery(user.id, source);
  try {
    const result = await activeScan;
    return NextResponse.json({ ok: true, runs: result.runs, totalJobs: result.jobs.length, persistence: result.persistence, applicationsSubmitted: 0, emailsSent: 0, dryRun: true });
  } finally { activeScan = null; }
}
