import type { CandidateProfile, MasterResume } from "@rolevana/domain";
import type { NormalizedJob, RemoteRegion } from "@rolevana/job-sources";

export const brainStates = ["DISCOVERED","QUALIFYING","REJECTED_ROLE","REJECTED_LOCATION","REJECTED_EXPERIENCE","QUALIFIED","MATCHING","MATCHED","RESUME_ANALYSIS","MASTER_RESUME_OK","TAILORING_RESUME","TAILORED","ATS_VALIDATING","TRUTHFULNESS_VALIDATING","READY_FOR_APPLICATION","NEEDS_REVIEW","BLOCKED","APPLICATION_PREPARED","WAITING_FOR_FREE_AI"] as const;
export type BrainState = typeof brainStates[number];
export const agentNames = ["ScoutAgent","QualificationAgent","MatchAgent","ResumeAgent","ATSAgent","TruthfulnessAgent","ApplicationPrepAgent","VerificationAgent"] as const;
export type AgentName = typeof agentNames[number];
export type PrivacyClass = "PUBLIC_JOB_DATA" | "SANITIZED_CANDIDATE_DATA" | "SENSITIVE_CANDIDATE_DATA";
export type ResumeRecommendation = "MASTER_RESUME" | "TAILORED_RESUME" | "NEEDS_REVIEW";
export type EvidenceKind = "SKILL" | "EXPERIENCE" | "PROJECT" | "PROFILE" | "MASTER_RESUME";
export type EvidenceNode = { id: string; kind: EvidenceKind; label: string; text: string; verified: boolean };
export type EvidenceGraph = { nodes: EvidenceNode[]; skillEvidence: Record<string, string[]> };
export type MatchEvidence = { factor: string; score: number; reason: string; evidenceIds: string[] };
export type MatchResult = {
  overallScore: number; roleMatch: boolean; experienceMatch: boolean; locationMatch: boolean;
  matchedSkills: string[]; missingRequiredSkills: string[]; preferredSkills: string[];
  evidence: MatchEvidence[]; recommendation: ResumeRecommendation; disclaimer: string;
};
export type ATSCompatibility = { atsCompatibilityScore: number; keywordCoverage: number; requiredSkillCoverage: number; layoutSafe: boolean; issues: string[]; suggestions: string[] };
export type TraceableBullet = { id: string; text: string; sourceEvidenceIds: string[] };
export type TailoredResumeContent = { summary: string; orderedSkills: string[]; bullets: TraceableBullet[] };
export type TruthfulnessResult = { valid: boolean; rejectedBulletIds: string[]; unsupportedSkills: string[]; status: "VERIFIED" | "FAILED" };
export type ResumeVersion = { id: string; jobId: string; company: string; role: string; createdAt: string; strategy: ResumeRecommendation; provider: string; model: string; evidenceIds: string[]; validationStatus: TruthfulnessResult["status"]; atsCompatibility: ATSCompatibility; hash: string; content: TailoredResumeContent };
export type ApplicationMethod = "BROWSER_FORM" | "EMAIL" | "MANUAL" | "UNKNOWN";
export type ApplicationPreparation = { applicationMethod: ApplicationMethod; resumeVersionId: string | null; knownAnswers: Record<string, string>; unknownQuestions: string[]; reviewReasons: string[]; status: "READY_FOR_APPLICATION" | "NEEDS_REVIEW"; submissionAttempted: false; emailSent: false };
export type ProviderProvenance = { provider: string; model: string; latencyMs: number; fallbackCount: number; aiCostUsd: 0; task: string; privacyClass: PrivacyClass };
export type BrainRecord = {
  id: string; jobId: string; jobHash: string; jobTitle: string; company: string; state: BrainState; workerId: number | null;
  priorityScore: number; priorityEvidence: MatchEvidence[]; match: MatchResult | null; resumeStrategy: ResumeRecommendation | null;
  tailoredResume: TailoredResumeContent | null; resumeVersion: ResumeVersion | null; ats: ATSCompatibility | null; truthfulness: TruthfulnessResult | null;
  application: ApplicationPreparation | null; reviewReasons: string[]; provenance: ProviderProvenance[]; transitions: Array<{ state: BrainState; at: string; agent: AgentName; reason: string }>;
  startedAt: string; updatedAt: string; completedAt: string | null; applicationsSubmitted: 0; emailsSent: 0;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]/g, " ").replace(/\s+/g, " ").trim();
const slug = (value: string) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unique = <T>(values: T[]) => [...new Set(values)];
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
export const stableHash = (value: string) => { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`; };

export function sanitizeCandidateProfile(profile: CandidateProfile) {
  return {
    identity: "CANDIDATE",
    currentRole: profile.currentRole,
    totalYearsExperience: profile.totalYearsExperience,
    skills: profile.skills.map(({ name, years, level }) => ({ name, ...(years === undefined ? {} : { years }), ...(level === undefined ? {} : { level }) })),
    experience: profile.experience.map((item) => ({ role: item.role, duration: `${item.startDate} - ${item.current ? "Present" : item.endDate ?? "Unknown"}`, summary: redactPII(item.summary, profile), achievements: item.achievements.map((value) => redactPII(value, profile)), technologies: item.technologies })),
    projects: profile.projects.map((item) => ({ name: "Candidate project", description: redactPII(item.description, profile), technologies: item.technologies, achievements: item.achievements.map((value) => redactPII(value, profile)) })),
    preferences: { targetRole: profile.primaryTargetRoleTitle, remoteOnly: profile.remoteOnly, allowedRegions: profile.allowedRegions }
  };
}

function redactPII(value: string, profile: CandidateProfile) {
  let result = value;
  const direct = [profile.fullName, profile.preferredName, profile.email, profile.phone, profile.city, profile.currentEmployer, profile.linkedInUrl, profile.githubUrl, profile.portfolioUrl, profile.websiteUrl].filter((item) => item.trim().length > 1);
  for (const item of direct) result = result.replaceAll(item, "[REDACTED]");
  return result
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED]")
    .replace(/https?:\/\/(?:www\.)?(?:linkedin|github)\.com\/\S+/gi, "[REDACTED]")
    .replace(/(?:api[_ -]?key|token|password|oauth)\s*[:=]\s*\S+/gi, "[REDACTED]");
}

export function buildEvidenceGraph(profile: CandidateProfile, resume?: MasterResume | null): EvidenceGraph {
  const nodes: EvidenceNode[] = [];
  const skillEvidence: Record<string, string[]> = {};
  const add = (node: EvidenceNode, skills: string[]) => { nodes.push(node); for (const skill of skills) { const key = normalize(skill); skillEvidence[key] = unique([...(skillEvidence[key] ?? []), node.id]); } };
  profile.skills.forEach((skill, index) => add({ id: `skill-${index}-${slug(skill.name)}`, kind: "SKILL", label: skill.name, text: `${skill.name}${skill.years === undefined ? "" : ` (${skill.years} years)`}`, verified: true }, [skill.name]));
  profile.experience.forEach((item, index) => add({ id: `experience-${index}-${slug(item.role)}`, kind: "EXPERIENCE", label: item.role, text: [item.role, item.summary, ...item.achievements].filter(Boolean).join(" · "), verified: true }, item.technologies));
  profile.projects.forEach((item, index) => add({ id: `project-${index}-${slug(item.name)}`, kind: "PROJECT", label: item.name, text: [item.name, item.description, ...item.achievements].filter(Boolean).join(" · "), verified: true }, item.technologies));
  if (resume?.verificationStatus === "VERIFIED") add({ id: `resume-${resume.id}`, kind: "MASTER_RESUME", label: "Verified master resume", text: resume.rawText.slice(0, 1000), verified: true }, resume.parsedData.skills.map((item) => item.value));
  return { nodes, skillEvidence };
}

const skillCatalog = ["React","TypeScript","JavaScript","Next.js","Redux","GraphQL","REST","Cypress","Tailwind","Node.js","AWS","Kubernetes","Java","Spring","Vue","Angular","HTML","CSS","Jest","Playwright","Docker","Python","SQL"];
export function extractSkills(text: string) { const haystack = normalize(text); return skillCatalog.filter((skill) => { const needle = normalize(skill); return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(haystack); }); }
const jobRequiredSkills = (job: NormalizedJob) => unique([...job.requirements.flatMap(extractSkills), ...extractSkills(job.description)]);
const jobPreferredSkills = (job: NormalizedJob) => unique(job.preferredQualifications.flatMap(extractSkills));

function roleMatches(job: NormalizedJob, profile: CandidateProfile) {
  const title = normalize(job.title); const target = normalize(profile.primaryTargetRoleTitle || profile.currentRole);
  if (!target) return false;
  const keywords = target.split(" ").filter((part) => !["engineer","developer","manager","specialist"].includes(part));
  return keywords.some((part) => title.includes(part)) || job.roleCategory === profile.primaryTargetRoleCategory;
}
function locationMatches(regions: RemoteRegion[], profile: CandidateProfile) {
  if (regions.includes("REMOTE_WORLDWIDE")) return true;
  const allowed = profile.allowedRegions.map(normalize);
  return regions.some((region) => (region === "REMOTE_INDIA" && allowed.includes("india")) || (region === "REMOTE_APAC" && allowed.includes("apac")) || (region === "REMOTE_EU_ONLY" && allowed.includes("europe")) || (region === "REMOTE_UK_ONLY" && allowed.includes("uk")) || (region === "UNKNOWN" && !profile.remoteOnly));
}
export function qualifyJob(job: NormalizedJob, profile: CandidateProfile) {
  if (!roleMatches(job, profile)) return { qualified: false, state: "REJECTED_ROLE" as const, reason: "The title does not match the selected target role." };
  if (!locationMatches(job.remoteRegions, profile)) return { qualified: false, state: "REJECTED_LOCATION" as const, reason: "The job's known location restrictions are outside the candidate's allowed regions." };
  const minimum = job.minimumYearsExperience;
  if (minimum !== undefined && minimum > profile.totalYearsExperience + profile.experienceToleranceYears) return { qualified: false, state: "REJECTED_EXPERIENCE" as const, reason: `The role requires ${minimum}+ years; the verified profile has ${profile.totalYearsExperience}.` };
  return { qualified: true, state: "QUALIFIED" as const, reason: "Role, location, and experience pass deterministic qualification." };
}

export function matchJob(job: NormalizedJob, profile: CandidateProfile, graph = buildEvidenceGraph(profile)): MatchResult {
  const required = jobRequiredSkills(job); const preferred = jobPreferredSkills(job); const candidate = new Set(Object.keys(graph.skillEvidence));
  const matchedSkills = required.filter((skill) => candidate.has(normalize(skill)));
  const missingRequiredSkills = required.filter((skill) => !candidate.has(normalize(skill)));
  const skillScore = required.length ? matchedSkills.length / required.length * 100 : 70;
  const role = roleMatches(job, profile); const location = locationMatches(job.remoteRegions, profile);
  const experience = job.minimumYearsExperience === undefined || job.minimumYearsExperience <= profile.totalYearsExperience + profile.experienceToleranceYears;
  const experienceScore = job.minimumYearsExperience === undefined ? 70 : experience ? 100 : 0;
  const overallScore = clamp((role ? 30 : 0) + skillScore * .4 + experienceScore * .2 + (location ? 10 : 0));
  const evidenceIds = matchedSkills.flatMap((skill) => graph.skillEvidence[normalize(skill)] ?? []);
  const recommendation: ResumeRecommendation = missingRequiredSkills.length > Math.max(1, Math.ceil(required.length * .35)) ? "NEEDS_REVIEW" : skillScore >= 80 ? "MASTER_RESUME" : "TAILORED_RESUME";
  return { overallScore, roleMatch: role, experienceMatch: experience, locationMatch: location, matchedSkills, missingRequiredSkills, preferredSkills: preferred, recommendation, disclaimer: "Rolevana internal compatibility score; not an employer ATS score.", evidence: [
    { factor: "Role alignment", score: role ? 100 : 0, reason: role ? "Title/category matches the selected target role." : "Target role mismatch.", evidenceIds: [] },
    { factor: "Skill overlap", score: clamp(skillScore), reason: `${matchedSkills.length} of ${required.length} identified requirements have verified evidence.`, evidenceIds: unique(evidenceIds) },
    { factor: "Experience compatibility", score: experienceScore, reason: job.minimumYearsExperience === undefined ? "No reliable minimum was found." : `${job.minimumYearsExperience}+ years requested versus ${profile.totalYearsExperience} verified years.`, evidenceIds: [] },
    { factor: "Location compatibility", score: location ? 100 : 0, reason: location ? "Known remote region is allowed." : "Known remote region is not allowed.", evidenceIds: [] }
  ] };
}

export function freshnessPriority(job: NormalizedJob, now = new Date()) {
  const posted = job.postedAt ?? job.discoveredAt; const hours = Math.max(0, (now.getTime() - posted.getTime()) / 3_600_000);
  if (hours < 1) return { bucket: "JUST_POSTED" as const, score: 100 };
  if (hours < 6) return { bucket: "VERY_FRESH" as const, score: 85 };
  if (hours < 24) return { bucket: "TODAY" as const, score: 70 };
  if (hours < 72) return { bucket: "RECENT" as const, score: 45 };
  return { bucket: "OLDER" as const, score: 15 };
}
export function calculatePriority(job: NormalizedJob, match: MatchResult, now = new Date()) {
  const fresh = freshnessPriority(job, now); const readiness = match.recommendation === "MASTER_RESUME" ? 100 : match.recommendation === "TAILORED_RESUME" ? 70 : 20;
  const score = clamp(match.overallScore * .5 + fresh.score * .3 + readiness * .2);
  return { score, evidence: [{ factor: "Candidate match", score: match.overallScore, reason: match.disclaimer, evidenceIds: match.evidence.flatMap((item) => item.evidenceIds) }, { factor: `Freshness: ${fresh.bucket}`, score: fresh.score, reason: "Newly posted jobs receive higher processing priority.", evidenceIds: [] }, { factor: "Application readiness", score: readiness, reason: `Resume strategy: ${match.recommendation}.`, evidenceIds: [] }] };
}

export function createTailoredResume(profile: CandidateProfile, match: MatchResult, graph: EvidenceGraph): TailoredResumeContent {
  const orderedSkills = unique([...match.matchedSkills, ...profile.skills.map((item) => item.name)]);
  const nodes = unique(match.matchedSkills.flatMap((skill) => graph.skillEvidence[normalize(skill)] ?? [])).map((id) => graph.nodes.find((node) => node.id === id)).filter((node): node is EvidenceNode => Boolean(node));
  return { summary: `${profile.currentRole || profile.primaryTargetRoleTitle} with ${profile.totalYearsExperience} years of verified experience, emphasizing ${match.matchedSkills.slice(0, 4).join(", ") || "relevant experience"}.`, orderedSkills, bullets: nodes.filter((node) => node.kind === "EXPERIENCE" || node.kind === "PROJECT").slice(0, 8).map((node, index) => ({ id: `bullet-${index + 1}`, text: node.text, sourceEvidenceIds: [node.id] })) };
}
export function validateTruthfulness(content: TailoredResumeContent, graph: EvidenceGraph): TruthfulnessResult {
  const verified = new Set(graph.nodes.filter((node) => node.verified).map((node) => node.id));
  const rejectedBulletIds = content.bullets.filter((bullet) => bullet.sourceEvidenceIds.length === 0 || bullet.sourceEvidenceIds.some((id) => !verified.has(id))).map((bullet) => bullet.id);
  const supportedSkills = new Set(Object.keys(graph.skillEvidence)); const unsupportedSkills = content.orderedSkills.filter((skill) => !supportedSkills.has(normalize(skill)));
  const valid = rejectedBulletIds.length === 0 && unsupportedSkills.length === 0;
  return { valid, rejectedBulletIds, unsupportedSkills, status: valid ? "VERIFIED" : "FAILED" };
}
export function validateATS(job: NormalizedJob, content: TailoredResumeContent, match: MatchResult): ATSCompatibility {
  const required = jobRequiredSkills(job); const text = normalize(`${content.summary} ${content.orderedSkills.join(" ")} ${content.bullets.map((item) => item.text).join(" ")}`);
  const covered = required.filter((skill) => text.includes(normalize(skill))); const keywordCoverage = required.length ? clamp(covered.length / required.length * 100) : 100;
  const issues = [...(match.missingRequiredSkills.length ? [`Missing verified requirements: ${match.missingRequiredSkills.join(", ")}`] : []), ...(content.orderedSkills.length > 40 ? ["Skill list may be overly dense."] : [])];
  return { atsCompatibilityScore: clamp(keywordCoverage * .7 + (issues.length ? 20 : 30)), keywordCoverage, requiredSkillCoverage: keywordCoverage, layoutSafe: true, issues, suggestions: match.missingRequiredSkills.length ? ["Do not add missing skills without verified evidence."] : ["Keep standard headings and single-column structure."] };
}
export function prepareApplication(job: NormalizedJob, profile: CandidateProfile, resumeVersionId: string | null): ApplicationPreparation {
  const applicationMethod: ApplicationMethod = job.applicationEmail ? "EMAIL" : /^https?:/i.test(job.applicationUrl) ? "BROWSER_FORM" : "UNKNOWN";
  const knownAnswers: Record<string, string> = { currentRole: profile.currentRole, yearsExperience: String(profile.totalYearsExperience), preferredRole: profile.primaryTargetRoleTitle, remotePreference: profile.remoteOnly ? "Remote only" : "Flexible", noticePeriod: profile.noticePeriod };
  const unknownQuestions = [...(!profile.workAuthorization.trim() ? ["workAuthorization"] : []), ...(profile.sponsorshipRequired === "UNKNOWN" ? ["sponsorshipRequired"] : [])];
  if (profile.workAuthorization.trim()) knownAnswers.workAuthorization = profile.workAuthorization;
  if (profile.sponsorshipRequired !== "UNKNOWN") knownAnswers.sponsorshipRequired = profile.sponsorshipRequired;
  const reviewReasons = [...unknownQuestions.map((question) => `Verified answer required: ${question}`), ...(applicationMethod === "UNKNOWN" ? ["Application method is unsupported or unknown."] : [])];
  return { applicationMethod, resumeVersionId, knownAnswers, unknownQuestions, reviewReasons, status: reviewReasons.length ? "NEEDS_REVIEW" : "READY_FOR_APPLICATION", submissionAttempted: false, emailSent: false };
}

const transition = (record: BrainRecord, state: BrainState, agent: AgentName, reason: string, now = new Date()) => { record.state = state; record.updatedAt = now.toISOString(); record.transitions.push({ state, at: record.updatedAt, agent, reason }); };
export type OrchestratorOptions = { minimumMatchScore?: number; now?: () => Date; provider?: string; model?: string };
export class RolevanaOrchestrator {
  private readonly minimumMatchScore: number; private readonly now: () => Date; private readonly provider: string; private readonly model: string;
  constructor(options: OrchestratorOptions = {}) { this.minimumMatchScore = options.minimumMatchScore ?? 75; this.now = options.now ?? (() => new Date()); this.provider = options.provider ?? "deterministic"; this.model = options.model ?? "rules-v1"; }
  process(job: NormalizedJob, profile: CandidateProfile, resume?: MasterResume | null, workerId: number | null = null): BrainRecord {
    const now = this.now(); const jobId = job.id ?? job.descriptionHash; const graph = buildEvidenceGraph(profile, resume);
    const record: BrainRecord = { id: `${jobId}-${stableHash(job.descriptionHash)}`, jobId, jobHash: job.descriptionHash, jobTitle: job.title, company: job.companyName, state: "DISCOVERED", workerId, priorityScore: 0, priorityEvidence: [], match: null, resumeStrategy: null, tailoredResume: null, resumeVersion: null, ats: null, truthfulness: null, application: null, reviewReasons: [], provenance: [], transitions: [], startedAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: null, applicationsSubmitted: 0, emailsSent: 0 };
    transition(record, "QUALIFYING", "QualificationAgent", "Starting deterministic qualification.", this.now());
    const qualification = qualifyJob(job, profile);
    if (!qualification.qualified) { transition(record, qualification.state, "QualificationAgent", qualification.reason, this.now()); record.completedAt = this.now().toISOString(); return record; }
    transition(record, "QUALIFIED", "QualificationAgent", qualification.reason, this.now()); transition(record, "MATCHING", "MatchAgent", "Building evidence-backed compatibility result.", this.now());
    const match = matchJob(job, profile, graph); record.match = match; const priority = calculatePriority(job, match, this.now()); record.priorityScore = priority.score; record.priorityEvidence = priority.evidence;
    transition(record, "MATCHED", "MatchAgent", `Internal compatibility ${match.overallScore}/100.`, this.now());
    if (match.overallScore < this.minimumMatchScore) { record.reviewReasons.push(`Match score ${match.overallScore} is below configured threshold ${this.minimumMatchScore}.`); transition(record, "NEEDS_REVIEW", "VerificationAgent", record.reviewReasons[0]!, this.now()); record.completedAt = this.now().toISOString(); return record; }
    transition(record, "RESUME_ANALYSIS", "ResumeAgent", "Selecting a truthful resume strategy.", this.now()); record.resumeStrategy = match.recommendation;
    if (resume?.verificationStatus !== "VERIFIED") record.reviewReasons.push("Master resume verification is required before this prepared version can be used.");
    if (record.resumeStrategy === "NEEDS_REVIEW") { record.reviewReasons.push("Missing requirements need user review; Rolevana will not manufacture supporting claims."); transition(record, "NEEDS_REVIEW", "ResumeAgent", record.reviewReasons.at(-1)!, this.now()); record.completedAt = this.now().toISOString(); return record; }
    let content: TailoredResumeContent;
    if (record.resumeStrategy === "TAILORED_RESUME") { transition(record, "TAILORING_RESUME", "ResumeAgent", "Reordering and emphasizing verified evidence only.", this.now()); content = createTailoredResume(profile, match, graph); record.tailoredResume = content; transition(record, "TAILORED", "ResumeAgent", "Created traceable structured resume content.", this.now()); }
    else { content = createTailoredResume(profile, match, graph); transition(record, "MASTER_RESUME_OK", "ResumeAgent", "Verified master resume already has strong coverage.", this.now()); }
    transition(record, "ATS_VALIDATING", "ATSAgent", "Checking keyword coverage and parse-safe structure.", this.now()); record.ats = validateATS(job, content, match);
    transition(record, "TRUTHFULNESS_VALIDATING", "TruthfulnessAgent", "Checking every generated claim against verified evidence IDs.", this.now()); record.truthfulness = validateTruthfulness(content, graph);
    if (!record.truthfulness.valid) { record.reviewReasons.push("Generated content contains unsupported claims."); transition(record, "NEEDS_REVIEW", "TruthfulnessAgent", record.reviewReasons.at(-1)!, this.now()); record.completedAt = this.now().toISOString(); return record; }
    const versionId = `resume-${jobId}-${stableHash(JSON.stringify(content))}`; record.resumeVersion = { id: versionId, jobId, company: job.companyName, role: job.title, createdAt: this.now().toISOString(), strategy: record.resumeStrategy, provider: this.provider, model: this.model, evidenceIds: unique(content.bullets.flatMap((item) => item.sourceEvidenceIds)), validationStatus: record.truthfulness.status, atsCompatibility: record.ats, hash: stableHash(JSON.stringify(content)), content };
    transition(record, "READY_FOR_APPLICATION", "VerificationAgent", "Resume content is traceable and ATS compatibility has been evaluated.", this.now()); record.application = prepareApplication(job, profile, versionId);
    if (record.application.status === "NEEDS_REVIEW" || record.reviewReasons.length) { record.reviewReasons.push(...record.application.reviewReasons); transition(record, "NEEDS_REVIEW", "ApplicationPrepAgent", record.reviewReasons.join(" "), this.now()); }
    else transition(record, "APPLICATION_PREPARED", "ApplicationPrepAgent", "Dry-run application package prepared. No submission attempted.", this.now());
    record.completedAt = this.now().toISOString(); return record;
  }
}

export type WorkerActivity = { workerId: number; jobId: string | null; jobTitle: string | null; company: string | null; state: BrainState | "IDLE" };
export async function runWorkerPool<T extends { priorityScore: number }>(items: T[], concurrency: number, processor: (item: T, workerId: number) => Promise<void>, onActivity?: (activity: WorkerActivity) => void) {
  const queue = [...items].sort((left, right) => right.priorityScore - left.priorityScore); const workers = Math.max(1, Math.floor(concurrency));
  await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async (_, index) => { const workerId = index + 1; while (queue.length) { const item = queue.shift(); if (!item) break; await processor(item, workerId); } onActivity?.({ workerId, jobId: null, jobTitle: null, company: null, state: "IDLE" }); }));
}

export const assistantActions = ["WHY_MATCH","WHY_REJECTED","MATCHING_SKILLS","MISSING_SKILLS","COMPARE_JD_RESUME","EXPLAIN_RESUME_CHANGES","TAILORED_RESUME_PREVIEW","REGENERATE_BULLET","USE_MASTER_RESUME","EXPLAIN_ATS","WHY_REVIEW","FIND_SIMILAR","PAUSE_PROCESSING","RETRY_AI","CHANGE_TARGET_ROLE","ADJUST_MATCH_THRESHOLD"] as const;
export type AssistantAction = typeof assistantActions[number];
export function buildAssistantContext(action: AssistantAction, record: BrainRecord, job: NormalizedJob) {
  const base = { action, job: { id: record.jobId, title: job.title, company: job.companyName } };
  if (action === "WHY_MATCH" || action === "MATCHING_SKILLS" || action === "MISSING_SKILLS" || action === "COMPARE_JD_RESUME") return { ...base, requirements: job.requirements, match: record.match };
  if (action === "TAILORED_RESUME_PREVIEW" || action === "EXPLAIN_RESUME_CHANGES" || action === "REGENERATE_BULLET") return { ...base, resume: record.resumeVersion?.content ?? record.tailoredResume, evidenceIds: record.resumeVersion?.evidenceIds ?? [] };
  if (action === "EXPLAIN_ATS") return { ...base, ats: record.ats };
  if (action === "WHY_REVIEW") return { ...base, reviewReasons: record.reviewReasons };
  return base;
}

export type VerifiedAnswer = { key: string; value: string; verifiedAt: string };
export function answerStore(profile: CandidateProfile): VerifiedAnswer[] {
  const values: Array<[string, string]> = [["currentRole",profile.currentRole],["yearsExperience",String(profile.totalYearsExperience)],["preferredRole",profile.primaryTargetRoleTitle],["noticePeriod",profile.noticePeriod],["expectedCompensation",profile.expectedCompensation],["workAuthorization",profile.workAuthorization],["sponsorshipRequired",profile.sponsorshipRequired === "UNKNOWN" ? "" : profile.sponsorshipRequired]];
  return values.filter(([, value]) => value.trim()).map(([key, value]) => ({ key, value, verifiedAt: new Date().toISOString() }));
}
