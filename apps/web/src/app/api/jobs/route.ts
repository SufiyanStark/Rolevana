import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalJobSummaries } from "@/lib/job-store";
import { readLocalProfile } from "@/lib/local-store";
import { filterJobsForTarget, jobTabs, toJobListApiItem, type JobTab } from "@/lib/job-list-filter";

const DEFAULT_PAGE_SIZE = 25;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const requestedTab = params.get("tab") ?? "All";
  const tab = (jobTabs as readonly string[]).includes(requestedTab) ? requestedTab as JobTab : "All";
  const requestedPage = Number(params.get("page") ?? 1);
  const requestedPageSize = Number(params.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;

  const [items, profile] = await Promise.all([readLocalJobSummaries(user.id), readLocalProfile(user.id)]);
  const filtered = filterJobsForTarget(items, tab, profile);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    items: profile ? paged.map((item) => toJobListApiItem(item, profile)) : [],
    total: totalItems,
    page: clampedPage,
    pageSize,
    totalPages,
    tab,
    targetRole: profile?.primaryTargetRoleTitle ?? null,
    targetCategory: profile?.primaryTargetRoleCategory ?? null,
    applicationsSubmitted: 0,
    dryRun: true
  });
}
