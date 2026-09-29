import { candidateProfileSchema } from "@rolevana/domain";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalProfile, readLocalResume, readResumeImportReview, saveLocalProfile, updateLocalResume } from "@/lib/local-store";
import { refreshReadinessOnly } from "@/lib/brain-service";

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
  const verifiedAt=new Date().toISOString();
  await updateLocalResume(user.id, { ...resume, verifiedAt, verifiedChecksum:resume.checksum, verifiedVersionHash:resume.checksum }, { parsingStatus: "VERIFIED", verificationStatus: "VERIFIED" });
  await refreshReadinessOnly(user.id);
  return NextResponse.json({ ok: true, verifiedAt, versionHash:resume.checksum });
}

