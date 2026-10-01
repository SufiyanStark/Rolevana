import { describe, expect, it } from "vitest";
import type { PreparedApplicationPackage } from "@rolevana/applications";
import { preparedPackageDisplay } from "./application-display";

const pkg = { id: "application-1", packageVersion: 5, reviewStatus: "NEEDS_REVIEW", readinessStatus: "BLOCKED", blockers: [{ code: "MASTER_RESUME_UNVERIFIED", message: "Review" }], jobSnapshot: { source: "Remote OK" }, applicationMethod: { type: "AGGREGATOR_LISTING", provider: "Remote OK", executionSupport: "NOT_IMPLEMENTED" }, resume: { strategy: "MASTER_RESUME", tailoredResumeVersion: "historical-tailored", atsCompatibilityBefore: { compatibilityScore: 82 }, atsCompatibilityAfter: { compatibilityScore: 82, keywordCoverage: 88, requiredSkillCoverage: 88 }, truthfulnessStatus: "VERIFIED" } } as PreparedApplicationPackage;

describe("prepared package display", () => {
  it("uses authoritative package resume and destination metadata without a fake tailoring gain", () => expect(preparedPackageDisplay(pkg)).toMatchObject({ selectedResume: "Master Resume", atsCompatibility: 82, tailoringStatus: "Not required", historicalTailoredStatus: "Not selected", destinationType: "Aggregator listing", provider: "Remote OK", executionSupport: "Not implemented" }));
  it("keeps blocked packages previewable while approval remains blocked", () => expect(preparedPackageDisplay(pkg)).toMatchObject({ previewAvailable: true, approvalAvailable: false }));
});
