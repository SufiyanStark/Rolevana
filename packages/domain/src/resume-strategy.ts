export type ResumeStrategy = "MASTER_RESUME" | "TAILORED_RESUME" | "NEEDS_REVIEW";

export function selectResumeStrategy(input: {
  masterResumeVerified: boolean;
  requiredSkills: string[];
  masterResumeSkills: string[];
  unresolvedConflicts: number;
}): { strategy: ResumeStrategy; reason: string } {
  if (!input.masterResumeVerified || input.unresolvedConflicts > 0) return { strategy: "NEEDS_REVIEW", reason: "Candidate source-of-truth data is not fully verified." };
  const required = new Set(input.requiredSkills.map((skill) => skill.toLowerCase()));
  if (required.size === 0) return { strategy: "MASTER_RESUME", reason: "No job-specific skill emphasis is required." };
  const available = new Set(input.masterResumeSkills.map((skill) => skill.toLowerCase()));
  const covered = [...required].filter((skill) => available.has(skill)).length / required.size;
  if (covered >= 0.8) return { strategy: "MASTER_RESUME", reason: "The verified master resume already strongly represents the job requirements." };
  return { strategy: "TAILORED_RESUME", reason: "Truthful reordering and emphasis may improve relevance without changing candidate facts." };
}

export type TraceableResumeClaim = { id: string; text: string; sourceClaimIds: string[] };
export function validateTailoredResumeClaims(claims: TraceableResumeClaim[], verifiedSourceClaimIds: Set<string>) {
  const unsupported = claims.filter((claim) => claim.sourceClaimIds.length === 0 || claim.sourceClaimIds.some((id) => !verifiedSourceClaimIds.has(id)));
  return { valid: unsupported.length === 0, unsupportedClaimIds: unsupported.map((claim) => claim.id) };
}

