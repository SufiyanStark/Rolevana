import { describe, expect, it } from "vitest";
import { createEmptyCandidateProfile, type CandidateProfile } from "@rolevana/domain";
import type { JobListItem } from "@/lib/job-store";
import { evaluateJobForTarget, filterJobsForTarget } from "./job-list-filter";

const profile: CandidateProfile = { ...createEmptyCandidateProfile(), currentRole: "Frontend Engineer", primaryTargetRoleTitle: "Frontend Engineer", primaryTargetRoleCategory: "FRONTEND_ENGINEERING", totalYearsExperience: 3 };
const item = (title: string, roleCategory: string, overrides: Partial<JobListItem> = {}): JobListItem => ({
  id: title, title, companyName: "Acme", source: "MOCK",sourceType:"MANUAL",atsProvider:"UNKNOWN", roleCategory, regions: ["REMOTE_WORLDWIDE"], freshness: "TODAY", workplaceType: "REMOTE", status: "QUALIFIED_BY_FILTER", postedAt: new Date(), discoveredAt: new Date(), seniority: "UNKNOWN", minimumYearsExperience: null, maximumYearsExperience: null, duplicateSources: 1, frontendClassification: "AMBIGUOUS", ...overrides
});

describe("target-scoped job tabs", () => {
  const jobs = [
    item("Senior Frontend Engineer", "FRONTEND_ENGINEERING"),
    item("React Developer", "FRONTEND_ENGINEERING"),
    item("Product Manager", "PRODUCT"),
    item("Data Annotator", "DATA"),
    item("Software Engineer", "SOFTWARE_ENGINEERING")
  ];

  it("keeps unrelated roles out of All", () => {
    expect(filterJobsForTarget(jobs, "All", profile).map((job) => job.title)).toEqual(["Senior Frontend Engineer", "React Developer"]);
  });

  it("routes broad titles to classification and unrelated titles to rejected", () => {
    expect(filterJobsForTarget(jobs, "Needs Classification", profile).map((job) => job.title)).toEqual(["Software Engineer"]);
    expect(filterJobsForTarget(jobs, "Rejected", profile).map((job) => job.title)).toEqual(["Product Manager", "Data Annotator"]);
  });

  it("re-evaluates the same stored jobs when the target changes", () => {
    const qaProfile = { ...profile, primaryTargetRoleTitle: "QA Engineer", primaryTargetRoleCategory: "QA_SDET" as const, targetRoleSelectionSource: "USER" as const };
    const qaJobs = [...jobs, item("QA Automation Engineer", "QA_SDET")];
    expect(filterJobsForTarget(qaJobs, "All", qaProfile).map((job) => job.title)).toEqual(["QA Automation Engineer"]);
  });

  it("does not expose a stale AI-wait status for an obvious frontend title", () => {
    const obvious = item("Frontend Engineer", "FRONTEND_ENGINEERING", { status: "WAITING_FOR_FREE_AI", minimumYearsExperience: 4 });
    expect(evaluateJobForTarget(obvious, profile)).toMatchObject({ targetRoleEligible: true, experienceEligible: "ELIGIBLE", regionEligible: true, status: "QUALIFIED_BY_FILTER" });
  });

  it("marks a five-year requirement borderline and an eight-year requirement ineligible", () => {
    expect(evaluateJobForTarget(item("Frontend Engineer", "FRONTEND_ENGINEERING", { minimumYearsExperience: 5 }), profile).experienceEligible).toBe("BORDERLINE");
    expect(evaluateJobForTarget(item("Frontend Engineer", "FRONTEND_ENGINEERING", { minimumYearsExperience: 8 }), profile)).toMatchObject({ experienceEligible: "INELIGIBLE", status: "REJECTED_EXPERIENCE" });
  });
  it("keeps mixed senior titles and senior roles with unknown experience in Needs Classification",()=>{
    const mixed=item("Senior Java & React Developer","FRONTEND_ENGINEERING",{seniority:"SENIOR",minimumYearsExperience:3});
    const unknown=item("Senior Frontend Engineer","FRONTEND_ENGINEERING",{seniority:"SENIOR",minimumYearsExperience:null});
    expect(evaluateJobForTarget(mixed,profile)).toMatchObject({targetRoleEligible:null,status:"NEEDS_CLASSIFICATION"});
    expect(evaluateJobForTarget(unknown,profile)).toMatchObject({experienceEligible:"UNKNOWN",status:"NEEDS_CLASSIFICATION"});
    expect(evaluateJobForTarget(item("Senior Frontend Engineer","FRONTEND_ENGINEERING",{seniority:"SENIOR",minimumYearsExperience:3}),profile).status).toBe("QUALIFIED_BY_FILTER");
  });
});
