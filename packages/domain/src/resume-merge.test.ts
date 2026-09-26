import { describe, expect, it } from "vitest";
import { createEmptyCandidateProfile, mergeResumeIntoCandidateProfile, parseResumeText, type CandidateProfile, type ParsedResumeData } from "./index";

const field = <T>(value: T, confidence = 0.9) => ({ value, confidence, source: "resume" as const, evidence: "test" });
const parsed = (overrides: Partial<ParsedResumeData> = {}): ParsedResumeData => ({ personal: {}, links: {}, career: {}, skills: [], experience: [], projects: [], education: [], warnings: [], ...overrides });
const profile = (overrides: Partial<CandidateProfile> = {}): CandidateProfile => ({ ...createEmptyCandidateProfile(), ...overrides });

describe("resume profile merge", () => {
  it("populates empty scalar fields without review", () => {
    const result = mergeResumeIntoCandidateProfile(profile(), parsed({ personal: { fullName: field("Sufiyan Ahmed"), email: field("s@example.com") } }));
    expect(result.profile).toMatchObject({ fullName: "Sufiyan Ahmed", email: "s@example.com" });
    expect(result.summary).toMatchObject({ fieldsAdded: 2, conflicts: 0 });
  });

  it("treats an identical existing value as verified and not conflicting", () => {
    const result = mergeResumeIntoCandidateProfile(profile({ fullName: "Sufiyan Ahmed" }), parsed({ personal: { fullName: field("  sufiyan ahmed ") } }));
    expect(result.profile.fullName).toBe("Sufiyan Ahmed");
    expect(result.conflicts).toHaveLength(0);
  });

  it("retains an existing different value and stages a conflict", () => {
    const result = mergeResumeIntoCandidateProfile(profile({ currentRole: "Frontend Engineer" }), parsed({ career: { currentRole: field("DevOps Engineer") } }));
    expect(result.profile.currentRole).toBe("Frontend Engineer");
    expect(result.conflicts[0]).toMatchObject({ field: "currentRole", extractedValue: "DevOps Engineer", reason: "DIFFERENT_VALUE" });
  });

  it("populates structured work history when experience is empty", () => {
    const work = { company: "Acme", role: "Engineer", location: "", startDate: "2022", current: true, summary: "Built products", achievements: ["Built products"], technologies: ["React"] };
    const result = mergeResumeIntoCandidateProfile(profile(), parsed({ experience: [field(work)] }));
    expect(result.profile.experience).toEqual([work]);
    expect(result.summary.experienceAdded).toBe(1);
  });

  it("deduplicates skills case-insensitively and only adds new skills", () => {
    const result = mergeResumeIntoCandidateProfile(profile({ skills: [{ name: "React" }] }), parsed({ skills: [field("react"), field("TypeScript")] }));
    expect(result.profile.skills.map((item) => item.name)).toEqual(["React", "TypeScript"]);
    expect(result.summary.skillsAdded).toBe(1);
  });

  it("never deletes manually entered profile values or collections", () => {
    const current = profile({ preferredName: "Sufi", expectedCompensation: "₹30L", projects: [{ name: "Manual project", description: "", technologies: [], achievements: [], links: [] }] });
    const result = mergeResumeIntoCandidateProfile(current, parsed());
    expect(result.profile.preferredName).toBe("Sufi");
    expect(result.profile.expectedCompensation).toBe("₹30L");
    expect(result.profile.projects).toEqual(current.projects);
  });

  it("structures experience when PDF extraction joins the role and date", () => {
    const result = parseResumeText("Sufiyan Ahmed\n3 years of experience\nExperience\nFrontend EngineerJan 2024 – Present\nAcme, Remote\nBuilt a React application\nEducation");
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.value).toMatchObject({ role: "Frontend Engineer", company: "Acme", location: "Remote", current: true });
    expect(result.career.totalYearsExperience?.value).toBe(3);
  });
});
