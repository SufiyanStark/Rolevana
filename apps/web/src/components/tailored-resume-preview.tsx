import Link from "next/link";
import type { BrainRecord } from "@rolevana/brain";
import type { PreparedApplicationPackage } from "@rolevana/applications";
import { Badge, Button, Card } from "@rolevana/ui";
import { preparedPackageDisplay } from "@/lib/application-display";

export function TailoredResumePreview({ record, applicationPackage }: { record: BrainRecord; applicationPackage: PreparedApplicationPackage | null | undefined }) {
  const version = record.resumeVersion; if (!version && !applicationPackage) return null;
  const display = applicationPackage ? preparedPackageDisplay(applicationPackage) : null;
  const beforeScore = applicationPackage?.resume.atsCompatibilityBefore.compatibilityScore ?? version?.baselineATS?.atsCompatibilityScore;
  const afterScore = applicationPackage?.resume.atsCompatibilityAfter.compatibilityScore ?? version?.atsCompatibility.atsCompatibilityScore;
  const keywordCoverage = applicationPackage?.resume.atsCompatibilityAfter.keywordCoverage ?? version?.atsCompatibility.keywordCoverage;
  const requiredSkillCoverage = applicationPackage?.resume.atsCompatibilityAfter.requiredSkillCoverage ?? version?.atsCompatibility.requiredSkillCoverage;
  const layoutSafe = applicationPackage?.resume.atsCompatibilityAfter.layoutSafe ?? version?.atsCompatibility.layoutSafe;
  const changes = applicationPackage?.resume.changes.map((item) => ({ ...item, why: item.reason })) ?? version?.changes ?? [];
  return <div className="space-y-5">
    <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="m-0 text-base">Resume selection</h2><p className="mt-1 text-xs text-slate-500">{display ? `Package ${display.packageId} · v${display.packageVersion}` : `Version ${version?.id} · master file unchanged`}</p></div><Badge>{display?.truthfulness ?? version?.validationStatus ?? "Not validated"}</Badge></div>
      {display ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric name="Selected resume" value={display.selectedResume}/><Metric name="ATS compatibility" value={`${display.atsCompatibility}/100`}/><Metric name="Tailoring" value={display.tailoringStatus}/></div>{display.historicalTailoredStatus && <p className="mb-0 mt-3 text-xs text-slate-500">Historical tailored draft: {display.historicalTailoredStatus}.</p>}</> : afterScore !== undefined && <div className="mt-5 grid gap-3 sm:grid-cols-2"><Metric name="Master ATS compatibility" value={`${beforeScore ?? "—"}/100`}/><Metric name="Tailored ATS compatibility" value={`${afterScore}/100`}/></div>}
      {afterScore !== undefined && <dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><dt className="text-slate-500">Keyword coverage</dt><dd className="m-0 text-right">{keywordCoverage}%</dd><dt className="text-slate-500">Required-skill coverage</dt><dd className="m-0 text-right">{requiredSkillCoverage}%</dd><dt className="text-slate-500">Layout safety</dt><dd className="m-0 text-right">{layoutSafe ? "Parse-safe" : "Needs review"}</dd></dl>}
    </Card>
    <Card className="overflow-hidden"><div className="border-b border-white/[.07] p-5"><h2 className="m-0 text-base">Exact tailoring changes</h2><p className="mb-0 mt-1 text-xs text-slate-500">Unused historical drafts are never presented as the selected resume.</p></div>{changes.length ? changes.map((change) => <div className="border-b border-white/[.05] p-5 last:border-0" key={change.id}><div className="grid gap-3 md:grid-cols-2"><p className="text-xs text-slate-400">{change.before}</p><p className="text-xs text-slate-200">{change.after}</p></div><p className="mb-0 text-xs text-slate-500">Why: {change.why}</p></div>) : <div className="p-5 text-sm text-slate-500">No wording or ordering changes were required.</div>}</Card>
    {applicationPackage && display ? <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="m-0 text-base">Prepared application package</h2><p className="mb-0 mt-1 text-xs text-slate-500">Read-only preview · submission unavailable</p></div><Button asChild variant="secondary"><Link href={`/applications/${applicationPackage.id}/review`}>Preview Prepared Application</Link></Button></div><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs"><dt className="text-slate-500">Discovery source</dt><dd className="m-0 text-right">{display.discoverySource}</dd><dt className="text-slate-500">Application destination</dt><dd className="m-0 text-right">{display.destinationType}</dd><dt className="text-slate-500">Provider</dt><dd className="m-0 text-right">{display.provider}</dd><dt className="text-slate-500">Execution support</dt><dd className="m-0 text-right">{display.executionSupport}</dd><dt className="text-slate-500">Status</dt><dd className="m-0 text-right">{display.status}</dd></dl></Card> : null}
  </div>;
}

function Metric({ name, value }: { name: string; value: string }) { return <div className="rounded-lg bg-white/[.03] p-4"><div className="text-xs text-slate-500">{name}</div><div className="mt-1 font-semibold">{value}</div></div>; }
