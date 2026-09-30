import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runJobDiscovery } from "@/lib/discovery";

let activeScan: Promise<Awaited<ReturnType<typeof runJobDiscovery>>> | null = null;
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.DRY_RUN !== "true") return NextResponse.json({ error: "Phase 2 discovery requires DRY_RUN=true." }, { status: 412 });
  if(process.env.FREE_INFRA_MODE!=="true"||Number(process.env.MAX_AI_COST_USD??0)!==0)return NextResponse.json({error:"Phase 3C requires FREE_INFRA_MODE=true and MAX_AI_COST_USD=0."},{status:412});
  if (activeScan) return NextResponse.json({ error: "A discovery scan is already running." }, { status: 409 });
  const source = new URL(request.url).searchParams.get("source") || undefined;
  const force=new URL(request.url).searchParams.get("force")==="true"&&process.env.NODE_ENV!=="production";
  activeScan = runJobDiscovery(user.id, source,force);
  try {
    const result = await activeScan;
    return NextResponse.json({ ok: true, runs: result.runs, sourcesAttempted:result.runs.filter((item)=>!item.skippedReason).length,sourcesSkippedNotDue:result.runs.filter((item)=>item.skippedReason==="NOT_DUE").length,sourcesDisabled:result.runs.filter((item)=>item.skippedReason==="DISABLED").length,sourcesCoolingDown:result.runs.filter((item)=>item.skippedReason==="COOLDOWN").length,recordsFetched:result.runs.reduce((sum,item)=>sum+item.jobsFetched,0),totalJobs: result.jobs.length, persistence: result.persistence,...result.scanSummary,atsBoardsDiscovered:result.atsBoardsDiscovered,jobsQueuedToBrain:result.queuedToBrain, applicationsSubmitted: 0, emailsSent: 0,employerContacts:0, dryRun: true });
  } finally { activeScan = null; }
}
