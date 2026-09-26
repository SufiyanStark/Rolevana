import Link from "next/link";
import { Activity, BriefcaseBusiness, FileCheck2, Gauge, Settings, Sparkles, UserRound, Zap } from "lucide-react";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/profile", label: "Candidate profile", icon: UserRound },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileCheck2 },
  { href: "/review", label: "Review queue", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children, dryRun }: { children: ReactNode; dryRun: boolean }) {
  return <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="border-b border-white/[.07] bg-slate-950/55 px-5 py-5 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="mb-8 flex items-center gap-3 px-2"><span className="grid size-9 place-items-center rounded-xl bg-cyan-400 text-slate-950"><Sparkles size={18}/></span><div><div className="font-bold tracking-tight">Rolevana</div><div className="text-[10px] uppercase tracking-[.2em] text-slate-500">Find. Tailor. Apply.</div></div></div>
      <nav className="flex gap-1 overflow-x-auto lg:grid">{navigation.map(({href,label,icon:Icon}) => <Link className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white" href={href} key={href}><Icon size={17}/>{label}</Link>)}</nav>
      <div className="mt-7 hidden rounded-xl border border-cyan-400/15 bg-cyan-400/[.05] p-4 lg:block"><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-cyan-300"><Zap size={14}/>Automation guard</div><p className="m-0 text-xs leading-5 text-slate-400">{dryRun ? "Dry run is on. No application or email can be submitted." : "Live integrations require explicit configuration."}</p></div>
    </aside>
    <main className="min-w-0"><header className="flex h-16 items-center justify-between border-b border-white/[.07] px-5 lg:px-8"><div className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">Workspace / Personal</div>{dryRun && <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-amber-200">Dry run mode</div>}</header><div className="mx-auto max-w-[1400px] p-5 lg:p-8">{children}</div></main>
  </div>;
}

