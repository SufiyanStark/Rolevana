import { masterResumeSchema, mergeResumeIntoCandidateProfile, parseResumeText, RESUME_PARSER_VERSION, type MasterResume } from "@rolevana/domain";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { developmentLog, preserveLocalResume, readLocalProfile, readLocalResume, saveLocalProfile, saveResumeImportReview, updateLocalResume } from "@/lib/local-store";
import { extractResumeDocument, hasValidResumeSignature } from "@/lib/resume-text";

const allowedTypes = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const publicResume = (resume: MasterResume) => ({ ...masterResumeSchema.parse(resume), rawText: "" });
const extractionCounts = (resume: MasterResume) => ({ skills: resume.parsedData.skills.length, experience: resume.parsedData.experience.length, projects: resume.parsedData.projects.length, education: resume.parsedData.education.length });

async function mergeAndRespond(userId: string, resume: MasterResume, cached: boolean, status = 200) {
  const merge = mergeResumeIntoCandidateProfile(await readLocalProfile(userId), resume.parsedData);
  await Promise.all([
    saveLocalProfile(userId, merge.profile),
    saveResumeImportReview(userId, { conflicts: merge.conflicts, summary: merge.summary, updatedAt: new Date().toISOString() })
  ]);
  developmentLog("PROFILE_RESUME_MERGE_COMPLETED", { userId, resumeId: resume.id, cached, ...merge.summary });
  return NextResponse.json({
    ok: true, resumeId: resume.id, status: resume.parsingStatus, contentHash: resume.checksum, cached,
    extraction: extractionCounts(resume), profileMerge: merge.summary, mergedProfile: merge.profile, resume: publicResume(resume)
  }, { status });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await request.formData()).get("resume");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Upload a PDF or DOCX no larger than 10 MB." }, { status: 400 });
  if (!(await hasValidResumeSignature(file))) return NextResponse.json({ error: "The file contents do not match the declared PDF or DOCX type." }, { status: 400 });
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Production object storage is not configured yet." }, { status: 503 });
  const preserved = await preserveLocalResume(user.id, file);
  if (preserved.cached && preserved.resume.parserVersion === RESUME_PARSER_VERSION && ["PARSED", "REVIEW_REQUIRED", "VERIFIED"].includes(preserved.resume.parsingStatus)) return mergeAndRespond(user.id, preserved.resume, true);

  let resume = await updateLocalResume(user.id, preserved.resume, { parsingStatus: "EXTRACTING_TEXT" });
  try {
    const extractedDocument = await extractResumeDocument(file);
    const rawText = extractedDocument.text;
    developmentLog("RESUME_TEXT_EXTRACTED", { userId: user.id, resumeId: resume.id, characters: rawText.length, embeddedLinks: extractedDocument.embeddedLinks.length });
    if (!rawText) {
      resume = await updateLocalResume(user.id, resume, { rawText: "", parsingStatus: "WAITING_FOR_FREE_AI", verificationStatus: "REVIEW_REQUIRED" });
      return NextResponse.json({ ok: true, resumeId: resume.id, status: resume.parsingStatus, contentHash: resume.checksum, cached: preserved.cached, extraction: extractionCounts(resume), resume: publicResume(resume) }, { status: 202 });
    }
    resume = await updateLocalResume(user.id, resume, { rawText, parsingStatus: "PARSING" });
    const parsedData = parseResumeText(rawText, extractedDocument.embeddedLinks);
    developmentLog("RESUME_PARSED", { userId: user.id, resumeId: resume.id, ...extractionCounts({ ...resume, parsedData }) });
    resume = await updateLocalResume(user.id, resume, { rawText, parsedData, parserVersion: RESUME_PARSER_VERSION, parsingStatus: "PARSED", verificationStatus: "REVIEW_REQUIRED" });
    return mergeAndRespond(user.id, resume, preserved.cached, preserved.cached ? 200 : 201);
  } catch {
    resume = await updateLocalResume(user.id, resume, { parsingStatus: "FAILED", verificationStatus: "REVIEW_REQUIRED" });
    return NextResponse.json({ resume: publicResume(resume), error: "The original was preserved, but local text extraction failed." }, { status: 422 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const resume = await readLocalResume(user.id);
  return NextResponse.json({ resume: resume ? publicResume(resume) : null });
}
