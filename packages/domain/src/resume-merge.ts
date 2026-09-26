import { createEmptyCandidateProfile, type CandidateProfile, type ExtractedField, type ParsedResumeData } from "./index";

export type ProfileMergeConflict = {
  field: string;
  currentValue: unknown;
  extractedValue: unknown;
  confidence: number;
  reason: "DIFFERENT_VALUE" | "LOW_CONFIDENCE";
};

export type ProfileMergeSummary = {
  fieldsAdded: number;
  skillsAdded: number;
  experienceAdded: number;
  projectsAdded: number;
  educationAdded: number;
  conflicts: number;
  reviewRequired: boolean;
};

export type ProfileMergeResult = { profile: CandidateProfile; conflicts: ProfileMergeConflict[]; summary: ProfileMergeSummary };

const fieldMappings = [
  ["personal", "fullName"], ["personal", "email"], ["personal", "phone"], ["personal", "city"], ["personal", "country"],
  ["links", "linkedInUrl"], ["links", "githubUrl"], ["links", "portfolioUrl"], ["links", "websiteUrl"],
  ["career", "currentEmployer"], ["career", "currentRole"], ["career", "totalYearsExperience"]
] as const;

const isEmpty = (value: unknown) => value === undefined || value === null || value === "" || value === 0;
const comparable = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : JSON.stringify(value);
const collectionKey = (name: "experience" | "projects" | "education", value: unknown): string => {
  const item = value as Record<string, unknown>;
  if (name === "experience") return `${comparable(item.company)}|${comparable(item.role)}|${comparable(item.startDate)}`;
  if (name === "projects") return comparable(item.name);
  return `${comparable(item.institution)}|${comparable(item.degree)}|${comparable(item.field)}`;
};

export function mergeResumeIntoCandidateProfile(current: CandidateProfile | null | undefined, parsed: ParsedResumeData, minimumConfidence = 0.6): ProfileMergeResult {
  const profile: CandidateProfile = structuredClone(current ?? createEmptyCandidateProfile());
  const conflicts: ProfileMergeConflict[] = [];
  let fieldsAdded = 0;

  for (const [group, key] of fieldMappings) {
    const extracted = parsed[group][key as never] as ExtractedField<string | number> | undefined;
    if (!extracted) continue;
    const currentValue = profile[key as keyof CandidateProfile];
    if (extracted.confidence < minimumConfidence) {
      conflicts.push({ field: key, currentValue, extractedValue: extracted.value, confidence: extracted.confidence, reason: "LOW_CONFIDENCE" });
    } else if (isEmpty(currentValue)) {
      (profile as unknown as Record<string, unknown>)[key] = extracted.value;
      fieldsAdded += 1;
    } else if (comparable(currentValue) !== comparable(extracted.value)) {
      conflicts.push({ field: key, currentValue, extractedValue: extracted.value, confidence: extracted.confidence, reason: "DIFFERENT_VALUE" });
    }
  }

  const existingSkills = new Set(profile.skills.map((skill) => comparable(skill.name)));
  let skillsAdded = 0;
  for (const extracted of parsed.skills) {
    if (extracted.confidence < minimumConfidence) {
      conflicts.push({ field: "skills", currentValue: profile.skills.map((skill) => skill.name), extractedValue: extracted.value, confidence: extracted.confidence, reason: "LOW_CONFIDENCE" });
    } else if (!existingSkills.has(comparable(extracted.value))) {
      profile.skills.push({ name: extracted.value });
      existingSkills.add(comparable(extracted.value));
      skillsAdded += 1;
    }
  }

  const collectionCounts = { experience: 0, projects: 0, education: 0 };
  for (const name of ["experience", "projects", "education"] as const) {
    const existing = new Set(profile[name].map((item) => collectionKey(name, item)));
    for (const extracted of parsed[name]) {
      if (extracted.confidence < minimumConfidence) {
        conflicts.push({ field: name, currentValue: null, extractedValue: extracted.value, confidence: extracted.confidence, reason: "LOW_CONFIDENCE" });
      } else if (!existing.has(collectionKey(name, extracted.value))) {
        (profile[name] as unknown[]).push(extracted.value);
        existing.add(collectionKey(name, extracted.value));
        collectionCounts[name] += 1;
      }
    }
  }

  const summary: ProfileMergeSummary = {
    fieldsAdded, skillsAdded, experienceAdded: collectionCounts.experience, projectsAdded: collectionCounts.projects,
    educationAdded: collectionCounts.education, conflicts: conflicts.length, reviewRequired: conflicts.length > 0
  };
  return { profile, conflicts, summary };
}
