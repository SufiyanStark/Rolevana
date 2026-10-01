export const applicationPackageStates = ["PREPARING", "NEEDS_REVIEW", "NEEDS_CHANGES", "APPROVED", "READY_TO_APPLY", "STALE", "BLOCKED"] as const;
export type ApplicationPackageState = typeof applicationPackageStates[number];

export const applicationQuestionTypes = ["YEARS_EXPERIENCE", "CURRENT_ROLE", "CURRENT_EMPLOYER", "LOCATION", "NOTICE_PERIOD", "EXPECTED_COMPENSATION", "WORK_AUTHORIZATION", "SPONSORSHIP", "REMOTE_PREFERENCE", "RELOCATION", "SKILLS", "PORTFOLIO", "LINKEDIN", "GITHUB", "CUSTOM_TEXT", "LEGAL_ATTESTATION", "DEMOGRAPHIC_OPTIONAL", "UNKNOWN"] as const;
export type ApplicationQuestionType = typeof applicationQuestionTypes[number];
export type ApplicationAnswerSource = "PROFILE_VERIFIED" | "MASTER_RESUME_VERIFIED" | "JURISDICTION_AUTHORIZATION" | "USER_APPROVED" | "AI_DRAFT" | "NEEDS_USER_INPUT";
export type ApplicationAnswer = { id: string; question: string; normalizedQuestionType: ApplicationQuestionType; answer: string | null; source: ApplicationAnswerSource; evidenceIds: string[]; confidence: number; reviewRequired: boolean; sensitive: boolean; jurisdiction: string | null; characterLimit?: number; wordLimit?: number; originalGeneratedAnswer?: string; currentAnswer?: string; editedByUser: boolean; editedAt?: string };

export type ApplicationMethodType = "DIRECT_ATS" | "COMPANY_CAREER_PAGE" | "AGGREGATOR_LISTING" | "EMAIL_APPLICATION" | "PORTAL" | "UNKNOWN";
export type ApplicationUrlClassification = "EMPLOYER_DESTINATION" | "AGGREGATOR_LISTING" | "EMAIL_INSTRUCTION" | "PORTAL_LISTING" | "UNKNOWN";
export type ExecutionSupport = "SUPPORTED_FUTURE" | "MANUAL_ONLY" | "NOT_IMPLEMENTED" | "UNKNOWN";
export type ApplicationMethod = { type: ApplicationMethodType; provider: string | null; url: string | null; urlClassification: ApplicationUrlClassification; confidence: number; sourceConfidence: number; executionSupport: ExecutionSupport };
export type ApplicationInstruction = { id: string; text: string; source: "JOB_DESCRIPTION"; required: boolean; reviewRequired: boolean; evidenceReference: string };
export type ResumeSelectionStrategy = "MASTER_RESUME" | "TAILORED_RESUME" | "MASTER_RESUME_WITH_MINOR_REORDER";
export type ATSCompatibilitySnapshot = { compatibilityScore: number; keywordCoverage: number; requiredSkillCoverage: number; layoutSafe: boolean; missingVerifiedRequirements: string[]; warnings: string[] };
export type ResumeChange = { id: string; before: string; after: string; reason: string; evidenceIds: string[]; atsImpact: string };
export type PreparedResume = { strategy: ResumeSelectionStrategy; masterResumeVersion: string; masterResumeVerified: boolean; selectedResumeVersion: string; tailoredResumeVersion?: string; atsCompatibilityBefore: ATSCompatibilitySnapshot; atsCompatibilityAfter: ATSCompatibilitySnapshot; truthfulnessStatus: "VERIFIED" | "FAILED"; evidenceCoverage: number; unsupportedClaims: string[]; warnings: string[]; changes: ResumeChange[]; manualOverride: boolean };

export type ApplicationBlockerCode = "MASTER_RESUME_UNVERIFIED" | "UNSUPPORTED_RESUME_CLAIM" | "AUTHORIZATION_JURISDICTION_UNKNOWN" | "WORK_AUTHORIZATION_UNKNOWN" | "SPONSORSHIP_UNKNOWN" | "LEGAL_ATTESTATION" | "SALARY_REQUIRES_REVIEW" | "REQUIRED_APPLICATION_INSTRUCTION" | "APPLICATION_METHOD_UNKNOWN" | "MISSING_REQUIRED_FIELD" | "UNRESOLVED_CUSTOM_QUESTION" | "JOB_CHANGED" | "PACKAGE_STALE" | "JOB_NOT_ACTIVE";
export type ApplicationBlocker = { code: ApplicationBlockerCode; message: string; answerId?: string };
export type DependencyHashes = { job: string; profile: string; masterResume: string; selectedResume: string; authorization: string; targetRole: string };
export type ApplicationAuditEventType = "PACKAGE_CREATED" | "PACKAGE_REUSED" | "PACKAGE_REBUILT" | "RESUME_SELECTED" | "TAILORING_GENERATED" | "TRUTHFULNESS_VERIFIED" | "ANSWER_GENERATED" | "ANSWER_EDITED" | "AUTHORIZATION_RESOLVED" | "REVIEW_APPROVED" | "REVIEW_NEEDS_CHANGES" | "PACKAGE_MARKED_READY" | "PACKAGE_MARKED_STALE";
export type ApplicationAuditEvent = { id: string; type: ApplicationAuditEventType; at: string; detail: string };

export type PreparedApplicationPackage = {
  id: string; jobId: string;
  jobSnapshot: { title: string; company: string; location: string; source: string; canonicalJobUrl: string; applicationUrl: string | null; atsProvider: string | null; descriptionHash: string; lifecycleStatus: "ACTIVE" | "POSSIBLY_CLOSED" | "CLOSED" };
  candidateProfileVersion: string; targetRole: string;
  jobRegionEligibility: { regions: string[]; status: "REGION_ELIGIBLE" | "REGION_INELIGIBLE" | "UNKNOWN" };
  match: { score: number; matchedSkills: string[]; missingSkills: string[]; strengths: string[]; concerns: string[] };
  resume: PreparedResume; answers: ApplicationAnswer[];
  authorization: { jurisdiction: string | null; jurisdictionResolution: "COUNTRY_SPECIFIC" | "AUTHORIZATION_JURISDICTION_UNKNOWN"; workAuthorizationStatus: "AUTHORIZED" | "NOT_AUTHORIZED" | "UNKNOWN"; sponsorshipStatus: "YES" | "NO" | "UNKNOWN"; verificationStatus: "VERIFIED" | "UNVERIFIED" };
  applicationMethod: ApplicationMethod; applicationInstructions: ApplicationInstruction[]; blockers: ApplicationBlocker[]; warnings: string[];
  reviewStatus: ApplicationPackageState; readinessStatus: ApplicationPackageState; reviewNotes: string[];
  dependencies: DependencyHashes; auditTrail: ApplicationAuditEvent[];
  createdAt: string; updatedAt: string; packageVersion: number; previousVersionId?: string;
  safety: { dryRun: true; submissionAvailable: false; applicationsSubmitted: 0; emailsSent: 0; employerContacts: 0 };
};

export type PreparedApplicationInput = Omit<PreparedApplicationPackage, "reviewStatus" | "readinessStatus" | "auditTrail" | "createdAt" | "updatedAt" | "packageVersion" | "safety"> & { now?: string };
const event = (type: ApplicationAuditEventType, at: string, detail: string): ApplicationAuditEvent => ({ id: `${type}-${at}-${Math.random().toString(36).slice(2, 8)}`, type, at, detail });
const uniqueBlockers = (blockers: ApplicationBlocker[]) => [...new Map(blockers.map((item) => [`${item.code}:${item.answerId ?? ""}`, item])).values()];

export function calculateApplicationBlockers(input: Pick<PreparedApplicationPackage, "resume" | "answers" | "authorization" | "applicationMethod" | "applicationInstructions" | "jobSnapshot">): ApplicationBlocker[] {
  const blockers: ApplicationBlocker[] = [];
  if (input.resume.truthfulnessStatus !== "VERIFIED" || input.resume.unsupportedClaims.length) blockers.push({ code: "UNSUPPORTED_RESUME_CLAIM", message: "The selected resume contains an unsupported or unverified claim." });
  if (!input.resume.masterResumeVersion || !input.resume.masterResumeVerified) blockers.push({ code: "MASTER_RESUME_UNVERIFIED", message: "The master resume must be verified." });
  if (!input.authorization.jurisdiction) blockers.push({ code: "AUTHORIZATION_JURISDICTION_UNKNOWN", message: "A country-specific job or application jurisdiction is required before authorization and sponsorship can be resolved." });
  if (input.authorization.jurisdiction && (input.authorization.verificationStatus !== "VERIFIED" || input.authorization.workAuthorizationStatus === "UNKNOWN")) blockers.push({ code: "WORK_AUTHORIZATION_UNKNOWN", message: `Verified work authorization is required for ${input.authorization.jurisdiction}.` });
  if (input.authorization.jurisdiction && input.authorization.sponsorshipStatus === "UNKNOWN") blockers.push({ code: "SPONSORSHIP_UNKNOWN", message: `Verified sponsorship status is required for ${input.authorization.jurisdiction}.` });
  if (input.applicationMethod.type === "UNKNOWN") blockers.push({ code: "APPLICATION_METHOD_UNKNOWN", message: "Rolevana could not identify a supported application path." });
  for (const instruction of input.applicationInstructions ?? []) if (instruction.required && instruction.reviewRequired) blockers.push({ code: "REQUIRED_APPLICATION_INSTRUCTION", message: `A required employer application instruction needs review: ${instruction.text}` });
  if (input.jobSnapshot.lifecycleStatus !== "ACTIVE") blockers.push({ code: "JOB_NOT_ACTIVE", message: "The job is closed or may be closed and must be revalidated." });
  for (const answer of input.answers) {
    if (answer.normalizedQuestionType === "LEGAL_ATTESTATION") blockers.push({ code: "LEGAL_ATTESTATION", message: "A legal attestation requires explicit user review.", answerId: answer.id });
    else if (answer.normalizedQuestionType === "EXPECTED_COMPENSATION" && answer.reviewRequired) blockers.push({ code: "SALARY_REQUIRES_REVIEW", message: "Compensation must be reviewed in the requested currency and context.", answerId: answer.id });
    else if ((!answer.answer || answer.source === "NEEDS_USER_INPUT") && !["WORK_AUTHORIZATION", "SPONSORSHIP"].includes(answer.normalizedQuestionType)) blockers.push({ code: answer.normalizedQuestionType === "CUSTOM_TEXT" ? "UNRESOLVED_CUSTOM_QUESTION" : "MISSING_REQUIRED_FIELD", message: `An answer is required for: ${answer.question}`, answerId: answer.id });
  }
  return uniqueBlockers(blockers);
}

export function createPreparedApplicationPackage(input: PreparedApplicationInput): PreparedApplicationPackage {
  const now = input.now ?? new Date().toISOString(); const blockers = calculateApplicationBlockers(input);
  return { ...input, blockers, reviewStatus: "NEEDS_REVIEW", readinessStatus: blockers.length ? "BLOCKED" : "NEEDS_REVIEW", auditTrail: [event("PACKAGE_CREATED", now, "Prepared locally for human review; no external action was performed."), event("RESUME_SELECTED", now, `${input.resume.strategy} selected.`), ...(input.resume.changes.length ? [event("TAILORING_GENERATED", now, `${input.resume.changes.length} evidence-backed resume changes prepared.`)] : []), ...(input.resume.truthfulnessStatus === "VERIFIED" ? [event("TRUTHFULNESS_VERIFIED", now, "Deterministic evidence validation passed.")] : []), ...input.answers.map((answer) => event("ANSWER_GENERATED", now, `${answer.normalizedQuestionType} prepared from ${answer.source}.`)), ...(input.authorization.verificationStatus === "VERIFIED" ? [event("AUTHORIZATION_RESOLVED", now, `Verified authorization record used for ${input.authorization.jurisdiction}.`)] : [])], createdAt: now, updatedAt: now, packageVersion: 1, safety: { dryRun: true, submissionAvailable: false, applicationsSubmitted: 0, emailsSent: 0, employerContacts: 0 } };
}

export function dependenciesChanged(left: DependencyHashes, right: DependencyHashes) { return (Object.keys(left) as Array<keyof DependencyHashes>).some((key) => left[key] !== right[key]); }
export function markPackageStale(pkg: PreparedApplicationPackage, current: DependencyHashes, now = new Date().toISOString()): PreparedApplicationPackage { if (!dependenciesChanged(pkg.dependencies, current) || (pkg.reviewStatus === "STALE" && pkg.blockers.some((item) => item.code === "PACKAGE_STALE"))) return pkg; return { ...pkg, blockers: uniqueBlockers([...pkg.blockers, { code: "PACKAGE_STALE", message: "Job, profile, resume, authorization, or target-role inputs changed." }]), reviewStatus: "STALE", readinessStatus: "STALE", updatedAt: now, auditTrail: [...pkg.auditTrail, event("PACKAGE_MARKED_STALE", now, "An upstream dependency hash changed; rebuild is required.")] }; }
export function approveApplicationPackage(pkg: PreparedApplicationPackage, now = new Date().toISOString()): PreparedApplicationPackage { const blockers = calculateApplicationBlockers(pkg); if (blockers.length || pkg.reviewStatus === "STALE") throw new Error("PACKAGE_APPROVAL_BLOCKED"); return { ...pkg, blockers: [], reviewStatus: "APPROVED", readinessStatus: "READY_TO_APPLY", updatedAt: now, auditTrail: [...pkg.auditTrail, event("REVIEW_APPROVED", now, "Human review approved the prepared package."), event("PACKAGE_MARKED_READY", now, "Prepared and approved. Not submitted.")] }; }
export function requestApplicationChanges(pkg: PreparedApplicationPackage, note: string, now = new Date().toISOString()): PreparedApplicationPackage { return { ...pkg, reviewStatus: "NEEDS_CHANGES", readinessStatus: "NEEDS_CHANGES", reviewNotes: note.trim() ? [...pkg.reviewNotes, note.trim()] : pkg.reviewNotes, updatedAt: now, auditTrail: [...pkg.auditTrail, event("REVIEW_NEEDS_CHANGES", now, note.trim() || "Reviewer requested changes.")] }; }

export function editApplicationAnswer(pkg: PreparedApplicationPackage, answerId: string, value: string, now = new Date().toISOString()): PreparedApplicationPackage {
  if (pkg.reviewStatus === "STALE") throw new Error("PACKAGE_REBUILD_REQUIRED");
  let found = false;
  const answers = pkg.answers.map((answer) => answer.id === answerId ? (found = true, { ...answer, answer: value, currentAnswer: value, originalGeneratedAnswer: answer.originalGeneratedAnswer ?? answer.answer ?? "", source: "USER_APPROVED" as const, confidence: 1, reviewRequired: false, editedByUser: true, editedAt: now }) : answer);
  if (!found) throw new Error("APPLICATION_ANSWER_NOT_FOUND");
  const next = { ...pkg, answers, reviewStatus: "NEEDS_REVIEW" as const, readinessStatus: "NEEDS_REVIEW" as const, updatedAt: now, auditTrail: [...pkg.auditTrail, event("ANSWER_EDITED", now, `User edited answer ${answerId}.`)] };
  return { ...next, blockers: calculateApplicationBlockers(next) };
}

export function overrideResumeSelection(pkg: PreparedApplicationPackage, selection: { strategy: ResumeSelectionStrategy; selectedResumeVersion: string; truthfulnessStatus: "VERIFIED" | "FAILED" }, now = new Date().toISOString()): PreparedApplicationPackage {
  if (pkg.reviewStatus === "STALE") throw new Error("PACKAGE_REBUILD_REQUIRED");
  if (selection.truthfulnessStatus !== "VERIFIED") throw new Error("RESUME_OVERRIDE_TRUTHFULNESS_FAILED");
  const resume = { ...pkg.resume, strategy: selection.strategy, selectedResumeVersion: selection.selectedResumeVersion, truthfulnessStatus: selection.truthfulnessStatus, manualOverride: true };
  const next = { ...pkg, resume, dependencies: { ...pkg.dependencies, selectedResume: selection.selectedResumeVersion }, reviewStatus: "NEEDS_REVIEW" as const, readinessStatus: "NEEDS_REVIEW" as const, updatedAt: now, auditTrail: [...pkg.auditTrail, event("RESUME_SELECTED", now, `User selected ${selection.strategy}.`)] };
  return { ...next, blockers: calculateApplicationBlockers(next) };
}

export function rebuildApplicationPackage(previous: PreparedApplicationPackage, replacement: PreparedApplicationPackage, now = new Date().toISOString()): PreparedApplicationPackage {
  const edited = new Map(previous.answers.filter((answer) => answer.editedByUser).map((answer) => [answer.id, answer])); const answers = replacement.answers.map((answer) => edited.get(answer.id) ?? answer);
  const next = { ...replacement, id: previous.id, previousVersionId: `${previous.id}:v${previous.packageVersion}`, packageVersion: previous.packageVersion + 1, createdAt: previous.createdAt, updatedAt: now, answers, reviewNotes: previous.reviewNotes, auditTrail: [...previous.auditTrail, event("PACKAGE_REBUILT", now, `Rebuilt package version ${previous.packageVersion + 1}.`)], reviewStatus: "NEEDS_REVIEW" as const, readinessStatus: "NEEDS_REVIEW" as const };
  const blockers = calculateApplicationBlockers(next); return { ...next, blockers, readinessStatus: blockers.length ? "BLOCKED" : "NEEDS_REVIEW" };
}

/** Future integration descriptor only. Deliberately has no execute/apply/submit method. */
export interface ApplicationExecutor { readonly id: string; readonly status: "NOT_IMPLEMENTED"; supports(method: ApplicationMethod): boolean }
export class NotImplementedApplicationExecutor implements ApplicationExecutor { readonly id = "not-implemented"; readonly status = "NOT_IMPLEMENTED" as const; supports(_method: ApplicationMethod) { return false; } }

const unsafeInstructionContent = /\b(?:ignore (?:all |any )?(?:previous|system)|system prompt|developer message|api key|oauth token|password|credential|execute code|run command|provider routing)\b/i;
const applicantInstructionSignal = /\b(?:when applying|in your application|application must|include (?:the )?(?:word|tag|reference|code|portfolio)|mention (?:the )?word|use reference code|email subject|answer (?:the )?question)\b/i;
export function extractApplicationInstructions(description: string, evidenceReference: string): ApplicationInstruction[] {
  const candidates = description.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map((item) => item.replace(/\*\*/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return candidates.filter((item) => applicantInstructionSignal.test(item) && !unsafeInstructionContent.test(item)).slice(0, 20).map((text, index) => ({ id: `job-instruction-${index + 1}`, text, source: "JOB_DESCRIPTION", required: true, reviewRequired: true, evidenceReference }));
}

export type QueueTaskStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | "WAITING_FOR_FREE_AI" | "PAID_SERVICE_REQUIRED";
export type QueueTask<T> = { id: string; payload: T; status: QueueTaskStatus; attempts: number; availableAt: Date; reason?: string };
export interface TaskQueue<T> { enqueue(task: QueueTask<T>): Promise<void>; takeReady(now?: Date): Promise<QueueTask<T> | null>; update(task: QueueTask<T>): Promise<void> }
export class LocalTaskQueue<T> implements TaskQueue<T> { private readonly tasks = new Map<string, QueueTask<T>>(); async enqueue(task: QueueTask<T>) { if (!this.tasks.has(task.id)) this.tasks.set(task.id, task); } async takeReady(now = new Date()) { return [...this.tasks.values()].find((task) => task.status === "QUEUED" && task.availableAt <= now) ?? null; } async update(task: QueueTask<T>) { this.tasks.set(task.id, task); } }
export function assertFreeInfrastructure(operation: { feature: string; requiresPaidService: boolean }, freeInfraMode: boolean) { if (freeInfraMode && operation.requiresPaidService) throw new Error(`PAID_SERVICE_REQUIRED: ${operation.feature}`); }
