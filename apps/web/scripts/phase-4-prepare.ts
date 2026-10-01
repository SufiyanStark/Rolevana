import { prepareApplicationPackage } from "../src/lib/application-service";

const userId = process.argv[2] ?? "local-development-user";
const jobId = process.argv[3];
if (!jobId) throw new Error("Usage: phase-4-prepare <userId> <jobId>");
const requiredJobId = jobId;
async function main() {
  const pkg = await prepareApplicationPackage(userId, requiredJobId, process.argv.includes("--rebuild"));
  const fullyPrepared = pkg.answers.filter((item) => item.answer && !item.reviewRequired).length;
  const preparedButReviewRequired = pkg.answers.filter((item) => item.answer && item.reviewRequired).length;
  const missing = pkg.answers.filter((item) => !item.answer).length;
  console.log(JSON.stringify({ id: pkg.id, reviewStatus: pkg.reviewStatus, readinessStatus: pkg.readinessStatus, match: pkg.match.score, resume: pkg.resume.strategy, atsBefore: pkg.resume.atsCompatibilityBefore.compatibilityScore, atsAfter: pkg.resume.atsCompatibilityAfter.compatibilityScore, tailoringStatus: pkg.resume.strategy === "MASTER_RESUME" && pkg.resume.atsCompatibilityBefore.compatibilityScore === pkg.resume.atsCompatibilityAfter.compatibilityScore ? "NOT_REQUIRED" : "SELECTED", truthfulness: pkg.resume.truthfulnessStatus, answerCounts: { total: pkg.answers.length, fullyPrepared, preparedButReviewRequired, missing }, noticePeriod: pkg.answers.find((item) => item.normalizedQuestionType === "NOTICE_PERIOD"), jobRegionEligibility: pkg.jobRegionEligibility, authorization: pkg.authorization, discoverySource: pkg.jobSnapshot.source, applicationMethod: pkg.applicationMethod, applicationInstructions: pkg.applicationInstructions, blockers: pkg.blockers.map((item) => item.code), warnings: pkg.warnings, packageVersion: pkg.packageVersion, auditEvents: pkg.auditTrail.map((item) => item.type), safety: pkg.safety, aiCalls: 0, aiCostUsd: 0 }, null, 2));
}
void main();
