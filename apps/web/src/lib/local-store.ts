import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createEmptyCandidateProfile, initializeTargetRole, RESUME_PARSER_VERSION, type CandidateProfile, type MasterResume, type ParsedResumeData, type ProfileMergeConflict, type ProfileMergeSummary, type ResumeParsingStatus } from "@rolevana/domain";

export type ResumeImportReview = { conflicts: ProfileMergeConflict[]; summary: ProfileMergeSummary; updatedAt: string };

const emptyParsedData = (): ParsedResumeData => ({ personal: {}, links: {}, career: {}, skills: [], experience: [], projects: [], education: [], warnings: [] });
const safeUserId = (userId: string) => userId.replace(/[^a-zA-Z0-9_-]/g, "_");
const appRoot = () => path.basename(process.cwd()).toLowerCase() === "web" ? process.cwd() : path.join(process.cwd(), "apps", "web");
export const getLocalDataDirectory = () => process.env.ROLEVANA_LOCAL_DATA_DIR || path.join(appRoot(), ".data");
const userDirectory = (userId: string) => path.join(getLocalDataDirectory(), safeUserId(userId));
const pathsFor = (userId: string) => {
  const directory = userDirectory(userId);
  return { directory, profile: path.join(directory, "profile.json"), resume: path.join(directory, "master-resume.json"), review: path.join(directory, "resume-review.json"), resumes: path.join(directory, "resumes"), imports: path.join(directory, "resume-imports") };
};
const ensureDirectories = async (userId: string) => {
  const paths = pathsFor(userId);
  await Promise.all([mkdir(paths.directory, { recursive: true }), mkdir(paths.resumes, { recursive: true }), mkdir(paths.imports, { recursive: true })]);
  return paths;
};
const writeJsonAtomic = async (file: string, value: unknown) => {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, file);
};
const readJson = async <T>(file: string): Promise<T | null> => {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; }
};

export function developmentLog(event: string, metadata: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production" && process.env.DRY_RUN === "true") console.info(event, metadata);
}

export async function saveLocalProfile(userId: string, profile: CandidateProfile) {
  const paths = await ensureDirectories(userId);
  await writeJsonAtomic(paths.profile, profile);
  developmentLog("PROFILE_SAVED", { userId, skills: profile.skills.length, experience: profile.experience.length, projects: profile.projects.length, education: profile.education.length });
}

export async function readLocalProfile(userId: string): Promise<CandidateProfile | null> {
  const paths = await ensureDirectories(userId);
  let value = await readJson<Partial<CandidateProfile>>(paths.profile);
  if (!value) {
    value = await readJson<Partial<CandidateProfile>>(path.join(getLocalDataDirectory(), "candidate-profile.json"));
    if (value) await writeJsonAtomic(paths.profile, { ...createEmptyCandidateProfile(), ...value });
  }
  if (!value) return null;
  const normalized = initializeTargetRole({ ...createEmptyCandidateProfile(), ...value } as CandidateProfile);
  developmentLog("PROFILE_LOADED", { userId, skills: normalized.skills.length, experience: normalized.experience.length, projects: normalized.projects.length, education: normalized.education.length });
  return normalized;
}

export async function readLocalResume(userId: string): Promise<MasterResume | null> {
  const paths = await ensureDirectories(userId);
  let value = await readJson<MasterResume>(paths.resume);
  if (!value) {
    value = await readJson<MasterResume>(path.join(getLocalDataDirectory(), "master-resume.json"));
    if (value) await writeJsonAtomic(paths.resume, value);
  }
  return value ? { ...value, uploadedAt: new Date(value.uploadedAt) } : null;
}

export async function preserveLocalResume(userId: string, file: File): Promise<{ resume: MasterResume; cached: boolean }> {
  const paths = await ensureDirectories(userId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const cacheFile = path.join(paths.imports, `${checksum}.json`);
  const currentResume = await readLocalResume(userId);
  const cachedResume = currentResume?.checksum === checksum ? currentResume : await readJson<MasterResume>(cacheFile);
  if (cachedResume) {
    await Promise.all([writeJsonAtomic(paths.resume, cachedResume), writeJsonAtomic(cacheFile, cachedResume)]);
    developmentLog("RESUME_CACHE_HIT", { userId, resumeId: cachedResume.id, contentHash: checksum });
    return { resume: { ...cachedResume, uploadedAt: new Date(cachedResume.uploadedAt) }, cached: true };
  }
  const id = randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storageKey = path.join("resumes", `${id}-${safeName}`);
  await writeFile(path.join(paths.directory, storageKey), bytes);
  const metadata: MasterResume = { id, originalFileName: file.name, mimeType: file.type as MasterResume["mimeType"], sizeBytes: file.size, storageKey, checksum, uploadedAt: new Date(), rawText: "", parserVersion: RESUME_PARSER_VERSION, parsedData: emptyParsedData(), parsingStatus: "UPLOADED", verificationStatus: "UNVERIFIED" };
  await Promise.all([writeJsonAtomic(paths.resume, metadata), writeJsonAtomic(cacheFile, metadata)]);
  developmentLog("RESUME_UPLOADED", { userId, resumeId: id, contentHash: checksum, sizeBytes: file.size });
  return { resume: metadata, cached: false };
}

export async function updateLocalResume(userId: string, resume: MasterResume, update: { rawText?: string; parsedData?: ParsedResumeData; parserVersion?: number; parsingStatus: ResumeParsingStatus; verificationStatus?: MasterResume["verificationStatus"] }): Promise<MasterResume> {
  const paths = await ensureDirectories(userId);
  const updated: MasterResume = { ...resume, ...update };
  await Promise.all([writeJsonAtomic(paths.resume, updated), writeJsonAtomic(path.join(paths.imports, `${updated.checksum}.json`), updated)]);
  return updated;
}

export async function saveResumeImportReview(userId: string, review: ResumeImportReview) {
  const paths = await ensureDirectories(userId);
  await writeJsonAtomic(paths.review, review);
}

export async function readResumeImportReview(userId: string): Promise<ResumeImportReview | null> {
  const paths = await ensureDirectories(userId);
  return readJson<ResumeImportReview>(paths.review);
}
