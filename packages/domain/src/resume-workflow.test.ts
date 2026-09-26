import { describe, expect, it } from "vitest";
import { parseResumeText, selectResumeStrategy, validateTailoredResumeClaims } from "./index";

describe("master resume workflow", () => {
  it("extracts supported facts without inventing absent skills", () => {
    const parsed = parseResumeText(`Sufiyan Ahmed\nsufiyan@example.com\nhttps://github.com/sufiyan\nSkills\nReact, TypeScript, Playwright`);
    expect(parsed.personal.email?.value).toBe("sufiyan@example.com");
    expect(parsed.skills.map((skill) => skill.value)).toEqual(expect.arrayContaining(["React", "TypeScript", "Playwright"]));
    expect(parsed.skills.some((skill) => skill.value === "AWS")).toBe(false);
  });
  it("uses the master resume when verified coverage is already strong", () => expect(selectResumeStrategy({ masterResumeVerified: true, requiredSkills: ["React", "TypeScript"], masterResumeSkills: ["React", "TypeScript", "CSS"], unresolvedConflicts: 0 }).strategy).toBe("MASTER_RESUME"));
  it("requires review for unverified candidate data", () => expect(selectResumeStrategy({ masterResumeVerified: false, requiredSkills: ["React"], masterResumeSkills: ["React"], unresolvedConflicts: 0 }).strategy).toBe("NEEDS_REVIEW"));
  it("rejects tailored claims without verified provenance", () => expect(validateTailoredResumeClaims([{ id: "new-claim", text: "Led 20 engineers", sourceClaimIds: [] }], new Set(["experience-1"]))).toEqual({ valid: false, unsupportedClaimIds: ["new-claim"] }));
});
