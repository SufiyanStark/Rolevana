import { candidateProfileSchema } from "@rolevana/domain";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalProfile, readLocalResume, readResumeImportReview, saveLocalProfile, updateLocalResume } from "@/lib/local-store";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profile: await readLocalProfile(user.id), resume: await readLocalResume(user.id), review: await readResumeImportReview(user.id) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = candidateProfileSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Complete all required profile fields before verification.", issues: result.error.flatten() }, { status: 400 });
  const resume = await readLocalResume(user.id);
  if (!resume) return NextResponse.json({ error: "No master resume exists." }, { status: 404 });
  await saveLocalProfile(user.id, result.data);
  await updateLocalResume(user.id, resume, { parsingStatus: "VERIFIED", verificationStatus: "VERIFIED" });
  return NextResponse.json({ ok: true });
}

