import { findRole, type CandidateProfile } from "@rolevana/domain";
import { experienceCompatibility, hasSeniorityRiskWithoutExperience, isRegionEligible, roleMatchesTarget, type DiscoveryStatus, type FreshnessBucket, type JobSourceProvider, type Seniority, type WorkplaceType } from "@rolevana/job-sources";
import type { JobListItem } from "@/lib/job-store";

export const jobTabs = ["All", "New", "Remote Eligible", "Needs Classification", "Rejected", "Duplicates"] as const;
export type JobTab = typeof jobTabs[number];

export type ExperienceEligibility = "ELIGIBLE" | "BORDERLINE" | "INELIGIBLE" | "UNKNOWN";
export type TargetJobEvaluation = { targetRoleEligible: boolean | null; experienceEligible: ExperienceEligibility; regionEligible: boolean | null; status: DiscoveryStatus };
export type JobListApiItem = {
  id: string; title: string; company: string; source: JobSourceProvider; roleCategory: string; region: string; freshness: FreshnessBucket;
  workplaceType: WorkplaceType; status: DiscoveryStatus; postedAt: string | null; discoveredAt: string; seniority: Seniority;
  minimumYearsExperience: number | null; maximumYearsExperience: number | null; targetRoleEligible: boolean | null; experienceEligible: ExperienceEligibility;
  directATS:boolean;duplicateSources:number;
};

export function targetRelation(item: JobListItem, profile: CandidateProfile): boolean | null {
  const role = findRole(profile.primaryTargetRoleTitle);
  return roleMatchesTarget(item.title, item.roleCategory, profile.primaryTargetRoleTitle, profile.primaryTargetRoleCategory, role?.relatedTitles ?? [], profile.includeRelatedTitles);
}

export function evaluateJobForTarget(item: JobListItem, profile: CandidateProfile): TargetJobEvaluation {
  const targetRoleEligible = targetRelation(item, profile);
  const regionEligible = isRegionEligible(item.regions, profile.allowedRegions);
  const compatibility = experienceCompatibility(profile.totalYearsExperience, item.minimumYearsExperience ?? undefined, profile.experienceToleranceYears);
  const experienceEligible: ExperienceEligibility = compatibility === "COMPATIBLE" ? "ELIGIBLE" : compatibility === "SLIGHTLY_ABOVE" ? "BORDERLINE" : compatibility === "MAJOR_MISMATCH" ? "INELIGIBLE" : "UNKNOWN";
  let status: DiscoveryStatus;
  if (item.workplaceType === "HYBRID" || item.workplaceType === "ONSITE") status = "REJECTED_NOT_REMOTE";
  else if (targetRoleEligible === false) status = "REJECTED_TARGET_ROLE";
  else if (targetRoleEligible === null) status = item.status === "WAITING_FOR_FREE_AI" ? "WAITING_FOR_FREE_AI" : "NEEDS_CLASSIFICATION";
  else if (hasSeniorityRiskWithoutExperience({seniority:item.seniority,...(item.minimumYearsExperience!==null?{minimumYearsExperience:item.minimumYearsExperience}:{})})) status = "NEEDS_CLASSIFICATION";
  else if (regionEligible === false) status = "REJECTED_LOCATION";
  else if (experienceEligible === "INELIGIBLE") status = "REJECTED_EXPERIENCE";
  else if (item.workplaceType === "UNKNOWN" || regionEligible === null) status = "NEEDS_CLASSIFICATION";
  else status = "QUALIFIED_BY_FILTER";
  return { targetRoleEligible, experienceEligible, regionEligible, status };
}

function isRejectedMatch(item: JobListItem, profile: CandidateProfile) {
  return evaluateJobForTarget(item, profile).status.startsWith("REJECTED");
}

function needsClassification(item: JobListItem, profile: CandidateProfile) {
  const status = evaluateJobForTarget(item, profile).status;
  return status === "NEEDS_CLASSIFICATION" || status === "WAITING_FOR_FREE_AI";
}

export function filterJobsForTarget(items: JobListItem[], tab: JobTab, profile: CandidateProfile | null, now = Date.now(),source="ALL",freshness="ALL"): JobListItem[] {
  if (!profile?.primaryTargetRoleTitle) return [];
  const scoped=items.filter((item)=>(source==="ALL"||item.source===source)&&(freshness==="ALL"||item.freshness===freshness));
  switch (tab) {
    case "All": return scoped.filter((item) => targetRelation(item, profile) === true);
    case "New": return scoped.filter((item) => targetRelation(item, profile) === true && now - item.discoveredAt.getTime() < 3_600_000);
    case "Remote Eligible": return scoped.filter((item) => evaluateJobForTarget(item, profile).status === "QUALIFIED_BY_FILTER");
    case "Needs Classification": return scoped.filter((item) => needsClassification(item, profile));
    case "Rejected": return scoped.filter((item) => isRejectedMatch(item, profile));
    case "Duplicates": return scoped.filter((item) => item.duplicateSources > 1 && targetRelation(item, profile) === true);
  }
}

const regionLabels: Record<string, string> = { REMOTE_WORLDWIDE: "Worldwide", REMOTE_INDIA: "India", REMOTE_APAC: "APAC", REMOTE_US_ONLY: "US only", REMOTE_CANADA_ONLY: "Canada only", REMOTE_EU_ONLY: "EU only", REMOTE_UK_ONLY: "UK only", REMOTE_LATAM: "LATAM", UNKNOWN: "Unknown" };
export function toJobListApiItem(item: JobListItem, profile: CandidateProfile): JobListApiItem {
  const evaluation = evaluateJobForTarget(item, profile);
  return {
    id: item.id, title: item.title, company: item.companyName, source: item.source, roleCategory: item.roleCategory,
    region: item.regions.map((region) => regionLabels[region] ?? region).join(", "), freshness: item.freshness, workplaceType: item.workplaceType,
    status: evaluation.status, postedAt: item.postedAt?.toISOString() ?? null, discoveredAt: item.discoveredAt.toISOString(), seniority: item.seniority,
    minimumYearsExperience: item.minimumYearsExperience, maximumYearsExperience: item.maximumYearsExperience,
    targetRoleEligible: evaluation.targetRoleEligible, experienceEligible: evaluation.experienceEligible,directATS:item.sourceType==="DIRECT_ATS",duplicateSources:item.duplicateSources
  };
}

export function humanJobStatus(status: DiscoveryStatus, experienceEligible?: ExperienceEligibility) {
  if (status === "QUALIFIED_BY_FILTER") return experienceEligible === "BORDERLINE" ? "Eligible · experience stretch" : "Eligible";
  if (status === "WAITING_FOR_FREE_AI") return "Waiting for free AI classification";
  if (status === "NEEDS_CLASSIFICATION") return "Needs classification";
  if (status === "REJECTED_TARGET_ROLE" || status === "REJECTED_ROLE") return "Not your selected role";
  if (status === "REJECTED_LOCATION") return "Location not eligible";
  if (status === "REJECTED_EXPERIENCE") return "Experience mismatch";
  if (status === "REJECTED_NOT_REMOTE") return "Not remote eligible";
  if (status === "DUPLICATE") return "Duplicate listing";
  return "Discovered";
}
