import { getSessionUser } from "@/lib/auth";
import { readLocalProfile } from "@/lib/local-store";
import { DiscoveryControls } from "@/components/discovery-controls";
import { JobsExplorer } from "@/components/jobs-explorer";
import { jobTabs, type JobTab } from "@/lib/job-list-filter";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; pageSize?: string }> }) {
  const user = await getSessionUser();
  const profile = user ? await readLocalProfile(user.id) : null;
  const params = await searchParams;
  const requestedTab = params.tab ?? "All";
  const tab = (jobTabs as readonly string[]).includes(requestedTab) ? requestedTab as JobTab : "All";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const requestedPageSize = Number(params.pageSize ?? 25); const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 25;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-2 text-sm text-slate-400">
          {profile?.primaryTargetRoleTitle ? <>{profile.totalYearsExperience}y experience · {profile.allowedRegions.join(", ")}</> : "Import or complete your profile to initialize a target role."}
        </p>
      </div>
      <DiscoveryControls/>
    </div>

    <JobsExplorer initialTitle={profile?.primaryTargetRoleTitle ?? ""} initialCategory={profile?.primaryTargetRoleCategory ?? "OTHER"} initialTab={tab} initialPage={page} initialPageSize={pageSize}/>
  </div>;
}
