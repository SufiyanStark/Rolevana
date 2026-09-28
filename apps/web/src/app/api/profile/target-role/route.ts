import { z } from "zod";
import { findRole, inferRoleCategory } from "@rolevana/domain";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalProfile, saveLocalProfile } from "@/lib/local-store";

const requestSchema = z.object({ title: z.string().trim().min(1).max(120) });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Production profile repository is not configured yet." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a target role between 1 and 120 characters." }, { status: 400 });
  const profile = await readLocalProfile(user.id);
  if (!profile) return NextResponse.json({ error: "Create or import a candidate profile before choosing a target role." }, { status: 409 });

  const catalogRole = findRole(parsed.data.title);
  const updated = {
    ...profile,
    primaryTargetRoleTitle: catalogRole?.title ?? parsed.data.title,
    primaryTargetRoleCategory: catalogRole?.category ?? inferRoleCategory(parsed.data.title),
    targetRoleSelectionSource: "USER" as const
  };
  await saveLocalProfile(user.id, updated);
  return NextResponse.json({ ok: true, targetRole: updated.primaryTargetRoleTitle, targetCategory: updated.primaryTargetRoleCategory });
}
