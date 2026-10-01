import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listApplicationPackages, prepareApplicationPackage } from "@/lib/application-service";

export async function GET() { const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json({ packages: await listApplicationPackages(user.id), applicationsSubmitted: 0, emailsSent: 0, employerContacts: 0 }); }
export async function POST(request: Request) { const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); try { const body = await request.json() as { jobId?: string }; if (!body.jobId) throw new Error("JOB_ID_REQUIRED"); return NextResponse.json({ package: await prepareApplicationPackage(user.id, body.jobId), applicationsSubmitted: 0, emailsSent: 0, employerContacts: 0, aiCalls: 0, aiCostUsd: 0 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Application preparation failed" }, { status: 400 }); } }
