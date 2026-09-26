import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalJobSummaries, readLocalJobs, type JobListItem } from "@/lib/job-store";
import { readLocalProfile } from "@/lib/local-store";
import { discoveryMetrics } from "@/lib/discovery";
import { findRole, type CandidateProfile } from "@rolevana/domain";
import { experienceCompatibility, roleMatchesTarget, isRegionEligible, type NormalizedJob } from "@rolevana/job-sources";

const DEFAULT_PAGE_SIZE = 25;
type Tab = "For Me" | "All" | "New" | "Remote Eligible" | "Needs Classification" | "Rejected" | "Duplicates";

function isForMe(item: JobListItem, profile: CandidateProfile | null): boolean {
  if (!profile?.primaryTargetRoleTitle) return item.status === "QUALIFIED_BY_FILTER";
  const role = findRole(profile.primaryTargetRoleTitle);
  const relatedTitles = role?.relatedTitles ?? [];
  const roleMatch = roleMatchesTarget(item.title, item.roleCategory, profile.primaryTargetRoleTitle, profile.primaryTargetRoleCategory, relatedTitles, profile.includeRelatedTitles);
  if (roleMatch === false) return false;
  const expCompat = experienceCompatibility(profile.totalYearsExperience, item.minimumYearsExperience ?? undefined, profile.experienceToleranceYears);
  if (expCompat === "MAJOR_MISMATCH") return false;
  if (item.status === "REJECTED_NOT_REMOTE" || item.status === "REJECTED_LOCATION" || item.status === "REJECTED_ROLE" || item.status === "REJECTED_TARGET_ROLE" || item.status === "REJECTED_EXPERIENCE") return false;
  return true;
}

function filterByTab(items: JobListItem[], tab: Tab, profile: CandidateProfile | null): JobListItem[] {
  switch (tab) {
    case "For Me": return items.filter((item) => isForMe(item, profile));
    case "All": return items;
    case "New": return items.filter((item) => Date.now() - new Date(item.discoveredAt).getTime() < 3_600_000);
    case "Remote Eligible": return items.filter((item) => item.status === "QUALIFIED_BY_FILTER");
    case "Needs Classification": return items.filter((item) => item.status === "NEEDS_CLASSIFICATION" || item.status === "WAITING_FOR_FREE_AI");
    case "Rejected": return items.filter((item) => item.status.startsWith("REJECTED"));
    case "Duplicates": return items.filter((item) => item.duplicateSources > 1);
    default: return items;
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const tab = (params.get("tab") ?? "For Me") as Tab;
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? DEFAULT_PAGE_SIZE)));
  const detail = params.get("id");

  // Single job detail - load full data
  if (detail) {
    const jobs = await readLocalJobs(user.id);
    const job = jobs.find((j) => (j.id ?? j.descriptionHash) === detail);
    return NextResponse.json({ job: job ?? null });
  }

  const [items, profile] = await Promise.all([readLocalJobSummaries(user.id), readLocalProfile(user.id)]);
  const filtered = filterByTab(items, tab, profile);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    items: paged,
    pagination: { page: clampedPage, pageSize, totalItems, totalPages },
    tab,
    targetRole: profile?.primaryTargetRoleTitle ?? null,
    targetCategory: profile?.primaryTargetRoleCategory ?? null,
    applicationsSubmitted: 0,
    dryRun: true
  });
}
