import { Badge, Card } from "@rolevana/ui";
import { getSessionUser } from "@/lib/auth";
import { readLocalJobSummaries, type JobListItem } from "@/lib/job-store";
import { readLocalProfile } from "@/lib/local-store";
import { findRole, type CandidateProfile } from "@rolevana/domain";
import { experienceCompatibility, roleMatchesTarget } from "@rolevana/job-sources";
import { DiscoveryControls } from "@/components/discovery-controls";
import Link from "next/link";

const PAGE_SIZE = 25;
const tabs = ["For Me", "All", "New", "Remote Eligible", "Needs Classification", "Rejected", "Duplicates"] as const;
type Tab = typeof tabs[number];

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
    case "For Me": return items.filter((i) => isForMe(i, profile));
    case "All": return items;
    case "New": return items.filter((i) => Date.now() - new Date(i.discoveredAt).getTime() < 3_600_000);
    case "Remote Eligible": return items.filter((i) => i.status === "QUALIFIED_BY_FILTER");
    case "Needs Classification": return items.filter((i) => i.status === "NEEDS_CLASSIFICATION" || i.status === "WAITING_FOR_FREE_AI");
    case "Rejected": return items.filter((i) => i.status.startsWith("REJECTED"));
    case "Duplicates": return items.filter((i) => i.duplicateSources > 1);
    default: return items;
  }
}

const age = (date: Date | string | null) => { if (!date) return "—"; const d = typeof date === "string" ? new Date(date) : date; const hours = Math.max(0, Math.floor((Date.now() - d.getTime()) / 3_600_000)); return hours < 1 ? "<1h" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`; };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const user = await getSessionUser();
  const [items, profile] = user ? await Promise.all([readLocalJobSummaries(user.id), readLocalProfile(user.id)]) : [[], null];
  const params = await searchParams;
  const requestedTab = params.tab ?? "For Me";
  const tab = (tabs as readonly string[]).includes(requestedTab) ? requestedTab as Tab : "For Me";
  const page = Math.max(1, Number(params.page ?? 1));

  const filtered = filterByTab(items, tab, profile);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const shown = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-2 text-sm text-slate-400">
          {profile?.primaryTargetRoleTitle ? <>Target: <strong className="text-cyan-200">{profile.primaryTargetRoleTitle}</strong> · {profile.totalYearsExperience}y exp · {profile.allowedRegions.join(", ")}</> : "Real, normalized public listings · newest posting first · discovery only."}
        </p>
      </div>
      <DiscoveryControls/>
    </div>

    <div className="my-6 flex gap-1 overflow-x-auto border-b border-white/10" role="tablist">
      {tabs.map((name) => <Link href={`/jobs?tab=${encodeURIComponent(name)}${page > 1 ? `&page=1` : ""}`} className={`shrink-0 border-b-2 px-3 py-3 text-sm transition-colors ${name === tab ? "border-cyan-300 font-semibold text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`} key={name} role="tab" aria-selected={name === tab}>{name} {name === tab && <span className="ml-1 text-[10px] text-slate-500">({totalItems})</span>}</Link>)}
    </div>

    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[1.5fr_.65fr_.75fr_.55fr_.75fr] border-b border-white/[.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-600 md:grid">
        <span>Role</span><span>Region</span><span>Freshness</span><span>Type</span><span>Status</span>
      </div>
      {shown.length ? shown.map((item) => <Link href={`/jobs/${encodeURIComponent(item.id)}`} className="grid gap-3 border-b border-white/[.06] px-5 py-5 last:border-0 hover:bg-white/[.02] md:grid-cols-[1.5fr_.65fr_.75fr_.55fr_.75fr] md:items-center" key={item.id}>
        <div>
          <div className="font-semibold">{item.title}</div>
          <div className="mt-1 text-xs text-slate-500">{item.companyName} · {item.source}</div>
        </div>
        <span className="text-xs text-slate-400">{item.regions.join(", ")}</span>
        <span className="text-xs text-slate-400">Posted {age(item.postedAt)} · found {age(item.discoveredAt)}</span>
        <span className="text-xs">
          {item.workplaceType}<br/>
          <span className="text-slate-500">{item.frontendClassification}</span>
        </span>
        <Badge className="w-fit">{item.status}</Badge>
      </Link>) : <div className="p-10 text-center text-sm text-slate-500">{tab === "For Me" ? `No jobs match your ${profile?.primaryTargetRoleTitle ?? "target role"} criteria yet. Run a discovery scan or adjust your target role.` : "No jobs in this view yet. Run a safe discovery scan to populate it."}</div>}
    </Card>

    {totalPages > 1 && <div className="mt-5 flex items-center justify-center gap-2">
      {clampedPage > 1 && <Link href={`/jobs?tab=${encodeURIComponent(tab)}&page=${clampedPage - 1}`} className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-sm transition hover:bg-white/[.08]">← Previous</Link>}
      <span className="px-3 py-2 text-sm text-slate-400">Page {clampedPage} of {totalPages} · {totalItems} jobs</span>
      {clampedPage < totalPages && <Link href={`/jobs?tab=${encodeURIComponent(tab)}&page=${clampedPage + 1}`} className="rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-sm transition hover:bg-white/[.08]">Next →</Link>}
    </div>}
  </div>;
}
