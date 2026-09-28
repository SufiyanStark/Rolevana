"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@rolevana/ui";
import { JobsTargetRole } from "@/components/jobs-target-role";
import { JobListSkeleton } from "@/components/job-list-skeleton";
import { DiscoveryControls } from "@/components/discovery-controls";
import { humanJobStatus, jobTabs, type JobListApiItem, type JobTab } from "@/lib/job-list-filter";

type JobsResponse = { items: JobListApiItem[]; total: number; page: number; pageSize: number; totalPages: number; tab: JobTab; error?: string };
const validPageSizes = [25, 50, 100] as const;
const age = (value: string | null) => { if (!value) return "Unknown"; const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000)); return hours < 1 ? "<1h" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`; };
const pagesAround = (page: number, totalPages: number): Array<number | "ellipsis"> => {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b); const result: Array<number | "ellipsis"> = [];
  sorted.forEach((value, index) => { if (index && value - sorted[index - 1]! > 1) result.push("ellipsis"); result.push(value); });
  return result;
};

export function JobsExplorer({ initialTitle, initialCategory, initialTab, initialPage, initialPageSize }: { initialTitle: string; initialCategory: string; initialTab: JobTab; initialPage: number; initialPageSize: number }) {
  const [targetTitle, setTargetTitle] = useState(initialTitle);
  const [targetCategory, setTargetCategory] = useState(initialCategory);
  const [tab, setTab] = useState<JobTab>(initialTab);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [result, setResult] = useState<JobsResponse>({ items: [], total: 0, page: initialPage, pageSize: initialPageSize, totalPages: 1, tab: initialTab });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetRevision, setTargetRevision] = useState(0);

  const syncUrl = useCallback((nextTab: JobTab, nextPage: number, nextPageSize: number) => {
    const params = new URLSearchParams(); params.set("tab", nextTab); params.set("page", String(nextPage)); params.set("pageSize", String(nextPageSize));
    window.history.replaceState(null, "", `/jobs?${params.toString()}`);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) });
    void fetch(`/api/jobs?${params.toString()}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json() as JobsResponse;
      if (!response.ok) throw new Error(body.error ?? "Could not load jobs.");
      setResult(body); if (body.page !== page) { setLoading(true); setPage(body.page); syncUrl(tab, body.page, pageSize); }
    }).catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, syncUrl, tab, targetRevision]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search); const requestedTab = params.get("tab") ?? "All";
      setLoading(true); setError("");
      setTab(jobTabs.includes(requestedTab as JobTab) ? requestedTab as JobTab : "All");
      setPage(Math.max(1, Number(params.get("page") ?? 1) || 1));
      const requestedSize = Number(params.get("pageSize") ?? 25); setPageSize(validPageSizes.includes(requestedSize as 25 | 50 | 100) ? requestedSize : 25);
    };
    window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore);
  }, []);

  const navigate = (nextTab: JobTab, nextPage: number, nextPageSize = pageSize) => { setLoading(true); setError(""); setTab(nextTab); setPage(nextPage); setPageSize(nextPageSize); syncUrl(nextTab, nextPage, nextPageSize); };
  const first = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const last = result.total ? Math.min(result.total, result.page * result.pageSize) : 0;

  return <>
    <div className="mt-6"><JobsTargetRole initialTitle={targetTitle} initialCategory={targetCategory} onSaved={(title, category) => { setLoading(true); setError(""); setTargetTitle(title); setTargetCategory(category); setPage(1); syncUrl(tab, 1, pageSize); setTargetRevision((value) => value + 1); }}/></div>
    <div className="my-6 flex gap-1 overflow-x-auto border-b border-white/10" role="tablist" aria-label="Job views">
      {jobTabs.map((name) => <button type="button" className={`shrink-0 border-b-2 bg-transparent px-3 py-3 text-sm transition-colors ${name === tab ? "border-cyan-300 font-semibold text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`} key={name} role="tab" aria-selected={name === tab} onClick={() => navigate(name, 1)}>{name} {name === tab && !loading && <span className="ml-1 text-[10px] text-slate-500">({result.total})</span>}</button>)}
    </div>
    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[1.5fr_.65fr_.75fr_.55fr_.75fr] border-b border-white/[.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-600 md:grid"><span>Role</span><span>Region</span><span>Freshness</span><span>Type</span><span>Status</span></div>
      {loading ? <JobListSkeleton/> : error ? <div role="alert" className="p-10 text-center text-sm text-red-300">{error}</div> : result.items.length ? result.items.map((item) => <Link href={`/jobs/${encodeURIComponent(item.id)}`} className="grid gap-3 border-b border-white/[.06] px-5 py-5 last:border-0 hover:bg-white/[.02] md:grid-cols-[1.5fr_.65fr_.75fr_.55fr_.75fr] md:items-center" key={item.id}>
        <div><div className="font-semibold">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.company} · {item.source}</div></div>
        <span className="text-xs text-slate-400">{item.region}</span>
        <span className="text-xs text-slate-400">Posted {age(item.postedAt)} · found {age(item.discoveredAt)}</span>
        <span className="text-xs">{item.workplaceType}<br/><span className="text-slate-500">{item.minimumYearsExperience === null ? item.seniority : `${item.minimumYearsExperience}${item.maximumYearsExperience !== null ? `–${item.maximumYearsExperience}` : "+"} years`}</span></span>
        <Badge className="w-fit">{humanJobStatus(item.status, item.experienceEligible)}</Badge>
      </Link>) : <div className="p-10 text-center"><div className="text-sm font-semibold text-slate-300">No matching {targetTitle || "target-role"} jobs found in your current sources.</div><div className="mt-5 flex flex-wrap justify-center gap-2"><DiscoveryControls/><Button asChild variant="secondary"><Link href="/sources">Add Sources</Link></Button><Button variant="secondary" onClick={() => document.querySelector<HTMLButtonElement>("#target-role-control > button")?.click()}>Change Target Role</Button></div></div>}
    </Card>
    <div className="mt-5 flex min-h-12 flex-wrap items-center justify-between gap-3" aria-label="Job pagination">
      <div className="text-sm text-slate-400">{loading && !result.total ? "Loading jobs…" : `Showing ${first}–${last} of ${result.total}`}</div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button variant="secondary" disabled={loading || result.page <= 1} onClick={() => navigate(tab, result.page - 1)}>Previous</Button>
        {pagesAround(result.page, result.totalPages).map((value, index) => value === "ellipsis" ? <span className="px-2 text-slate-600" key={`ellipsis-${index}`}>…</span> : <button type="button" aria-current={value === result.page ? "page" : undefined} className={`size-9 rounded-lg border text-sm ${value === result.page ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/10 bg-white/[.03] text-slate-400 hover:bg-white/[.07]"}`} key={value} disabled={loading} onClick={() => navigate(tab, value)}>{value}</button>)}
        <Button variant="secondary" disabled={loading || result.page >= result.totalPages} onClick={() => navigate(tab, result.page + 1)}>Next</Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-400"><span>Rows</span><select className="control w-auto py-2" value={pageSize} disabled={loading} onChange={(event) => navigate(tab, 1, Number(event.target.value))}>{validPageSizes.map((value) => <option className="bg-slate-900" value={value} key={value}>{value} per page</option>)}</select></label>
    </div>
  </>;
}
