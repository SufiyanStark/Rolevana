import { describe, expect, it } from "vitest";
import { createEmptyCandidateProfile } from "@rolevana/domain";
import { profileAfterResumeUpload } from "./profile-form-state";

describe("candidate profile upload state", () => {
  it("immediately selects the merged profile returned by resume upload", () => {
    const current = { ...createEmptyCandidateProfile(), fullName: "Manual Name" };
    const mergedProfile = { ...current, currentRole: "Frontend Engineer", skills: [{ name: "TypeScript" }] };
    expect(profileAfterResumeUpload(current, { mergedProfile })).toEqual(mergedProfile);
  });
});
