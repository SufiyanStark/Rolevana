import { findRole } from "@rolevana/domain";
import { reclassifyLocalJobs } from "../src/lib/job-store";
import { readLocalProfile } from "../src/lib/local-store";

async function main() {
  const userId = process.argv[2] ?? "local-development-user";
  const profile = await readLocalProfile(userId); if (!profile) throw new Error("PROFILE_NOT_FOUND");
  if (process.env.DRY_RUN !== "true" || process.env.FREE_AI_ONLY !== "true" || process.env.FREE_INFRA_MODE !== "true" || Number(process.env.MAX_AI_COST_USD) !== 0) throw new Error("PHASE_4_2_SAFETY_ASSERTION_FAILED");
  const role = findRole(profile.primaryTargetRoleTitle);
  const result = await reclassifyLocalJobs(userId, profile.allowedRegions, { selectedRoleTitle: profile.primaryTargetRoleTitle, roleCategory: profile.primaryTargetRoleCategory, relatedTitles: role?.relatedTitles ?? [], includeRelatedTitles: profile.includeRelatedTitles, candidateYearsExperience: profile.totalYearsExperience, experienceToleranceYears: profile.experienceToleranceYears });
  const titles = ["Sr. Software Engineer (Backend)", "Senior Software Engineer - Infrastructure Security", "Senior Software Engineer, Platform"];
  console.log(JSON.stringify({ before: result.before, after: result.after, changed: result.changed, jobs: titles.map((title) => { const job = result.jobs.find((item) => item.title === title); return { title, status: job?.status ?? "NOT_FOUND", reason: job?.classificationReason ?? null }; }), safety: { applicationsSubmitted: 0, emailsSent: 0, employerContacts: 0, aiCalls: 0, aiCostUsd: 0, discoveryCalls: 0 } }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
