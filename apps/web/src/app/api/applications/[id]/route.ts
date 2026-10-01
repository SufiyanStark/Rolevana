import { NextResponse } from "next/server";
import type { ResumeSelectionStrategy } from "@rolevana/applications";
import { getSessionUser } from "@/lib/auth";
import { approvePackage, getApplicationPackage, markPackageNeedsChanges, rebuildPackage, selectPackageResume, updateApplicationAnswer } from "@/lib/application-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; const pkg = await getApplicationPackage(user.id, id); return pkg ? NextResponse.json({ package: pkg }) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const { id } = await params; const body = await request.json() as { action?: "APPROVE" | "NEEDS_CHANGES" | "REBUILD" | "EDIT_ANSWER" | "SELECT_RESUME"; note?: string; answerId?: string; value?: string; strategy?: ResumeSelectionStrategy }; let pkg;
    if (body.action === "APPROVE") pkg = await approvePackage(user.id, id);
    else if (body.action === "NEEDS_CHANGES") pkg = await markPackageNeedsChanges(user.id, id, body.note ?? "");
    else if (body.action === "REBUILD") pkg = await rebuildPackage(user.id, id);
    else if (body.action === "EDIT_ANSWER" && body.answerId !== undefined && body.value !== undefined) pkg = await updateApplicationAnswer(user.id, id, body.answerId, body.value);
    else if (body.action === "SELECT_RESUME" && body.strategy) pkg = await selectPackageResume(user.id, id, body.strategy);
    else throw new Error("INVALID_APPLICATION_PACKAGE_ACTION");
    return NextResponse.json({ package: pkg, applicationsSubmitted: 0, emailsSent: 0, employerContacts: 0 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Package update failed" }, { status: 400 }); }
}
