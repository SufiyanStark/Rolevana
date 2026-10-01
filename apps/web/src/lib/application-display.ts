import type { PreparedApplicationPackage } from "@rolevana/applications";

const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());

export function preparedPackageDisplay(pkg: PreparedApplicationPackage) {
  const selectedATS = pkg.resume.atsCompatibilityAfter;
  const masterSelected = pkg.resume.strategy === "MASTER_RESUME";
  return {
    packageId: pkg.id,
    packageVersion: pkg.packageVersion,
    selectedResume: masterSelected ? "Master Resume" : label(pkg.resume.strategy),
    atsCompatibility: selectedATS.compatibilityScore,
    keywordCoverage: selectedATS.keywordCoverage,
    requiredSkillCoverage: selectedATS.requiredSkillCoverage,
    tailoringStatus: masterSelected && pkg.resume.atsCompatibilityBefore.compatibilityScore === selectedATS.compatibilityScore ? "Not required" : "Selected",
    historicalTailoredStatus: masterSelected && pkg.resume.tailoredResumeVersion ? "Not selected" : null,
    truthfulness: pkg.resume.truthfulnessStatus,
    discoverySource: pkg.jobSnapshot.source,
    destinationType: label(pkg.applicationMethod.type),
    provider: pkg.applicationMethod.provider ?? "Unknown",
    executionSupport: label(pkg.applicationMethod.executionSupport),
    status: `${label(pkg.reviewStatus)} / ${label(pkg.readinessStatus)}`,
    previewAvailable: true,
    approvalAvailable: pkg.blockers.length === 0 && pkg.reviewStatus !== "STALE",
  };
}
