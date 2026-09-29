import { candidateProfileSchema } from "@rolevana/domain";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalProfile, saveLocalProfile } from "@/lib/local-store";
import { refreshReadinessOnly } from "@/lib/brain-service";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Production profile repository is not configured yet." }, { status: 503 });
  return NextResponse.json({ profile: await readLocalProfile(user.id), userId: user.id });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = candidateProfileSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Invalid profile", issues: result.error.flatten() }, { status: 400 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Production profile repository is not configured yet." }, { status: 503 });
  await saveLocalProfile(user.id, result.data);
  await refreshReadinessOnly(user.id);
  return NextResponse.json({ ok: true, userId: user.id });
}

