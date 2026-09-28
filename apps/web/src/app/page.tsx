import { publicRuntimeConfig } from "@rolevana/config";
import { Badge, Button, Card } from "@rolevana/ui";
import { ArrowUpRight, Bot, Clock3, Coins, Radar, Rocket, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { readAIProviderHealth, readJobSourceRegistry, readLocalJobSummaries, readSourceRuns } from "@/lib/job-store";
import { readLocalProfile } from "@/lib/local-store";
import { discoveryMetricsFromSummaries } from "@/lib/discovery";
import { DiscoveryControls } from "@/components/discovery-controls";
import { evaluateJobForTarget, filterJobsForTarget, humanJobStatus } from "@/lib/job-list-filter";
import { readBrainSnapshot } from "@/lib/brain-store";
import { BrainControls } from "@/components/brain-controls";

const autopilotModes = [
  { id: "discovery", label: "Discovery Only", description: "Find jobs matching your target. No applications.", status: "Available" },
  { id: "preparation", label: "Discovery + Preparation", description: "Score, validate, and prepare jobs in dry-run mode.", status: "Active" },
  { id: "review", label: "Review Before Apply", description: "Queue matched jobs for your manual approval.", status: "Coming later" },
  { id: "auto", label: "Full Auto Apply", description: "Automatically tailor and submit applications.", status: "Coming later" },
] as const;

const pipelineSteps = ["Discover", "Target role filter", "Remote/location filter", "Experience check", "Candidate match", "Resume strategy", "Tailor if needed", "ATS validation", "Truthfulness check", "Application preparation", "Stop before submit"];

export default async function Dashboard() {
  const config = publicRuntimeConfig(process.env); const user = await getSessionUser();
  const [items, profile, sources, runs, health, brain] = user ? await Promise.all([readLocalJobSummaries(user.id), readLocalProfile(user.id), readJobSourceRegistry(user.id), readSourceRuns(user.id), readAIProviderHealth(user.id), readBrainSnapshot(user.id)]) : [[], null, [], [], [], {records:[],activities:[],reviews:[],metrics:{jobsProcessedToday:0,qualifiedToday:0,matchedToday:0,resumeReadyToday:0,applicationReadyToday:0,applicationsSubmittedToday:0,emailsSentToday:0}}];
  const metrics = discoveryMetricsFromSummaries(items); const latestRun = runs[0]; const healthy = sources.filter((source) => source.lastSuccessfulScan && !source.lastError).length; const failing = sources.filter((source) => source.lastError).length;
  const targetItems = filterJobsForTarget(items, "All", profile); const remoteEligible = filterJobsForTarget(items, "Remote Eligible", profile).length; const needsClassification = filterJobsForTarget(items, "Needs Classification", profile).length;
  const cards = [["Discovered today",metrics.jobsDiscoveredToday,"Real public listings",Radar],["New in last hour",metrics.newLastHour,"By discovery time",Clock3],["Remote eligible",remoteEligible,"Target role + region",ShieldCheck],["Needs classification",needsClassification,"Never discarded",TriangleAlert]] as const;

  return <div className="space-y-7">
    <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <Badge className="mb-4 border-cyan-300/20 bg-cyan-300/10 text-cyan-200">Phase 3A · Rolevana Brain</Badge>
        <h1 className="m-0 max-w-3xl text-3xl font-semibold tracking-[-.04em] md:text-5xl">{profile?.primaryTargetRoleTitle ? <>{profile.primaryTargetRoleTitle} roles,<br/><span className="text-slate-500">found without applying.</span></> : <>Remote roles,<br/><span className="text-slate-500">found without applying.</span></>}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">Public job feeds and ATS boards are filtered remote-first. Applications and email remain fully disabled.</p>
      </div>
      <DiscoveryControls/>
    </section>

    <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Bot size={18} className="text-cyan-300"/><h2 className="m-0 text-base font-semibold">Rolevana Brain / Autopilot</h2></div><p className="mt-1 text-xs text-slate-500">Discovery + Preparation · dry run only</p></div><BrainControls/></div><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5"><div><dt className="text-slate-500">Target</dt><dd className="m-0 font-medium">{profile?.primaryTargetRoleTitle||"Not set"}</dd></div><div><dt className="text-slate-500">Worker concurrency</dt><dd className="m-0 font-medium">{config.workerConcurrency}</dd></div><div><dt className="text-slate-500">Hourly processing goal</dt><dd className="m-0 font-medium">{config.hourlyProcessingTarget}</dd></div><div><dt className="text-slate-500">Daily future goal</dt><dd className="m-0 font-medium">{config.dailyApplicationTarget}</dd></div><div><dt className="text-slate-500">Providers healthy</dt><dd className="m-0 font-medium">{health.filter((item)=>item.status==="WORKING").length} / {health.length||9}</dd></div></dl><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Processed today",brain.metrics.jobsProcessedToday],["Qualified today",brain.metrics.qualifiedToday],["Resume-ready",brain.metrics.resumeReadyToday],["Application-ready",brain.metrics.applicationReadyToday],["Applications submitted",0]].map(([label,value])=><div className="rounded-lg bg-white/[.03] p-3" key={label}><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div></Card>

    <Card className="overflow-hidden"><div className="border-b border-white/[.07] p-5"><h2 className="m-0 text-base font-semibold">Agent Activity</h2><p className="mb-0 mt-1 text-xs text-slate-500">Persisted worker state; no simulated activity.</p></div>{Array.from({length:config.workerConcurrency},(_,index)=>brain.activities.find((item)=>item.workerId===index+1)??{workerId:index+1,jobId:null,jobTitle:null,company:null,state:"IDLE"}).map((activity)=><div className="flex items-center justify-between border-b border-white/[.05] px-5 py-3 last:border-0" key={activity.workerId}><div><div className="text-sm font-medium">Worker {activity.workerId}</div><div className="text-xs text-slate-500">{activity.jobTitle?`${activity.jobTitle} · ${activity.company}`:"Idle"}</div></div><Badge>{activity.state.replace(/_/g," ")}</Badge></div>)}</Card>

    {/* Status panel */}
    <Card className="overflow-hidden"><div className="grid gap-px bg-white/[.06] md:grid-cols-3">
      <div className="bg-slate-900 p-6"><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Autopilot discovery</div><div className="mt-5 text-2xl font-semibold">{config.autopilotDiscovery?"Enabled":"Off"}</div><p className="text-xs text-slate-500">{config.autopilotDiscovery?`Every ${config.scanIntervalMinutes} minutes`:`Manual scans available`}</p></div>
      <div className="bg-slate-900 p-6"><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Last scan</div><div className="mt-5 text-2xl font-semibold">{latestRun ? new Date(latestRun.finishedAt).toLocaleString() : "Not run"}</div><p className="text-xs text-slate-500">{healthy} healthy · {failing} failing · {sources.length} configured</p></div>
      <div className="bg-slate-900 p-6"><div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Safety mode</div><div className="mt-5 flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="text-emerald-300"/>Dry run</div><p className="text-xs text-slate-500">0 applications · 0 emails</p></div>
    </div></Card>

    {/* Metric cards */}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,copy,Icon])=><Card className="p-5" key={label}><div className="mb-5 flex items-center justify-between"><span className="text-sm text-slate-400">{label}</span><Icon size={17} className="text-slate-600"/></div><div className="text-3xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{copy}</div></Card>)}</section>

    {/* Autopilot UX panel */}
    <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card className="p-0 overflow-hidden">
        <div className="border-b border-white/[.07] p-5">
          <div className="flex items-center gap-2"><Rocket size={18} className="text-cyan-300"/><h2 className="m-0 text-base font-semibold">Autopilot</h2></div>
          <p className="mb-0 mt-1 text-xs text-slate-500">Current mode: Discovery + Preparation · submissions remain disabled.</p>
        </div>
        <div className="grid gap-px bg-white/[.06]">
          {autopilotModes.map((mode) => <div className={`flex items-center justify-between bg-slate-900 px-5 py-4 ${mode.status === "Coming later" ? "opacity-50" : ""}`} key={mode.id}>
            <div>
              <div className="flex items-center gap-2"><span className={`inline-block size-2 rounded-full ${mode.status === "Active" ? "bg-emerald-400" : mode.status === "Available" ? "bg-cyan-400" : "bg-slate-600"}`}/><span className="text-sm font-semibold">{mode.label}</span></div>
              <div className="ml-4 mt-0.5 text-xs text-slate-500">{mode.description}</div>
            </div>
            <Badge className={mode.status === "Active" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/10 text-slate-500"}>{mode.status}</Badge>
          </div>)}
        </div>
        <div className="border-t border-white/[.07] p-5">
          <div className="text-xs font-bold uppercase tracking-[.14em] text-slate-500 mb-3">Application pipeline</div>
          <div className="flex flex-wrap gap-1.5">{pipelineSteps.map((step, i) => <span className="flex items-center gap-1 text-[10px]" key={step}><span className={`rounded px-1.5 py-0.5 ${i === 0 ? "bg-cyan-300/15 text-cyan-200" : "bg-white/[.04] text-slate-500"}`}>{step}</span>{i < pipelineSteps.length - 1 && <span className="text-slate-600">→</span>}</span>)}</div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-5"><Target size={18} className="text-cyan-300"/><h2 className="m-0 text-base font-semibold">Target configuration</h2></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-slate-500">Autopilot mode</dt><dd className="m-0 text-right font-medium">Discovery + Preparation</dd>
          <dt className="text-slate-500">Target role</dt><dd className="m-0 text-right font-medium text-cyan-200">{profile?.primaryTargetRoleTitle || "Not set"}</dd>
          <dt className="text-slate-500">Role category</dt><dd className="m-0 text-right">{profile?.primaryTargetRoleCategory?.replace(/_/g, " ") ?? "—"}</dd>
          <dt className="text-slate-500">Experience</dt><dd className="m-0 text-right">{profile?.totalYearsExperience ?? 0} years (±{profile?.experienceToleranceYears ?? 1}y tolerance)</dd>
          <dt className="text-slate-500">Remote</dt><dd className="m-0 text-right">Remote only</dd>
          <dt className="text-slate-500">Regions</dt><dd className="m-0 text-right">{profile?.allowedRegions?.join(", ") ?? "India, Worldwide, APAC"}</dd>
          <dt className="text-slate-500">Scan interval</dt><dd className="m-0 text-right">{config.scanIntervalMinutes} minutes</dd>
          <dt className="text-slate-500">Applications today</dt><dd className="m-0 text-right">0 / {config.dailyApplicationTarget}</dd>
          <dt className="text-slate-500">Application engine</dt><dd className="m-0 text-right text-amber-200">Not enabled yet</dd>
        </dl>
      </Card>
    </section>

    {/* Jobs + AI section */}
    <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <div className="flex items-center justify-between border-b border-white/[.07] p-5">
          <div><h2 className="m-0 text-base font-semibold">Fresh jobs</h2><p className="mb-0 mt-1 text-xs text-slate-500">Newest known posted date first</p></div>
          <Button asChild variant="ghost" size="sm"><Link href="/jobs">View all <ArrowUpRight size={14}/></Link></Button>
        </div>
        {targetItems.slice(0,6).map((item)=><Link className="block border-b border-white/[.05] px-5 py-4 last:border-0 hover:bg-white/[.02]" href={`/jobs/${item.id}`} key={item.id}>
          <div className="flex items-center justify-between gap-4"><div><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.companyName} · {item.source} · {item.regions.join(", ")}</div></div><Badge>{profile ? humanJobStatus(evaluateJobForTarget(item, profile).status, evaluateJobForTarget(item, profile).experienceEligible) : "Discovered"}</Badge></div>
        </Link>)}
        {!targetItems.length&&<div className="p-8 text-center text-sm text-slate-500">No matching {profile?.primaryTargetRoleTitle ?? "target-role"} jobs found in your current sources.</div>}
      </Card>
      <div className="space-y-5">
        <Card className="p-5"><div className="flex items-center gap-2"><Bot size={18} className="text-cyan-300"/><h2 className="m-0 text-base font-semibold">AI providers</h2></div><div className="mt-4 space-y-3">{["openrouter","nvidia","agent-router"].map((provider)=>{const item=health.find((entry)=>entry.provider===provider);return <div className="flex items-center justify-between text-sm" key={provider}><span className="capitalize text-slate-400">{provider.replace("-"," ")}</span><Badge>{item?.status??"NOT TESTED"}</Badge></div>;})}</div></Card>
        <Card className="p-5"><div className="flex items-center gap-2"><Coins size={18} className="text-emerald-300"/><h2 className="m-0 text-base font-semibold">AI spend today</h2></div><div className="mt-4 text-3xl font-semibold">$0.00</div><p className="mb-0 text-xs text-slate-500">Free AI only enabled · unknown-cost models blocked.</p></Card>
      </div>
    </section>
  </div>;
}
