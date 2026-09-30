import { filterDiscoveredJob } from "@rolevana/job-sources";
import { findRole } from "@rolevana/domain";
import { reconcileBrainQueueEligibility } from "../src/lib/brain-store";
import { readLocalJobs, upsertLocalJobs } from "../src/lib/job-store";
import { readLocalProfile } from "../src/lib/local-store";

const userId="local-development-user";

async function main(){
  const [jobs,profile]=await Promise.all([readLocalJobs(userId),readLocalProfile(userId)]);
  if(!profile?.primaryTargetRoleTitle)throw new Error("TARGET_ROLE_NOT_CONFIGURED");
  const role=findRole(profile.primaryTargetRoleTitle);
  const target={selectedRoleTitle:profile.primaryTargetRoleTitle,roleCategory:profile.primaryTargetRoleCategory,relatedTitles:role?.relatedTitles??[],includeRelatedTitles:profile.includeRelatedTitles,candidateYearsExperience:profile.totalYearsExperience,experienceToleranceYears:profile.experienceToleranceYears};
  const reclassified=jobs.map((job)=>filterDiscoveredJob(job,profile.allowedRegions,target));
  const persistence=await upsertLocalJobs(userId,reclassified);
  const removedFromBrain=await reconcileBrainQueueEligibility(userId,persistence.jobs);
  console.log(JSON.stringify({updated:persistence.updated,removedFromBrain,qualified:persistence.jobs.filter((job)=>job.status==="QUALIFIED_BY_FILTER").length,needsClassification:persistence.jobs.filter((job)=>job.status==="NEEDS_CLASSIFICATION"||job.status==="WAITING_FOR_FREE_AI").length},null,2));
}
void main();
