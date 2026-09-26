"use client";
import { useEffect, useMemo, useState } from "react";
import type { CandidateProfile, ExtractedField, MasterResume, ParsedResumeData, ProfileMergeConflict } from "@rolevana/domain";
import { Badge, Button, Card } from "@rolevana/ui";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

type FlatKey = "fullName" | "email" | "phone" | "city" | "country" | "linkedInUrl" | "githubUrl" | "portfolioUrl" | "currentEmployer" | "currentRole" | "totalYearsExperience";
const fields: Array<{ key: FlatKey; label: string; group: "personal" | "links" | "career" }> = [
  { key: "fullName", label: "Full name", group: "personal" }, { key: "email", label: "Email", group: "personal" }, { key: "phone", label: "Phone", group: "personal" }, { key: "city", label: "City", group: "personal" }, { key: "country", label: "Country", group: "personal" },
  { key: "linkedInUrl", label: "LinkedIn", group: "links" }, { key: "githubUrl", label: "GitHub", group: "links" }, { key: "portfolioUrl", label: "Portfolio", group: "links" },
  { key: "currentEmployer", label: "Current employer", group: "career" }, { key: "currentRole", label: "Current role", group: "career" }, { key: "totalYearsExperience", label: "Years of experience", group: "career" }
];

const extractedFor = (data: ParsedResumeData, item: typeof fields[number]): ExtractedField<string | number> | undefined => data[item.group][item.key as never] as ExtractedField<string | number> | undefined;
const collectionLabels = (data: ParsedResumeData, name: "skills" | "experience" | "projects" | "education") => {
  if (name === "skills") return data.skills.map((item) => item.value);
  if (name === "experience") return data.experience.map((item) => `${item.value.role} · ${item.value.company}`);
  if (name === "projects") return data.projects.map((item) => item.value.name);
  return data.education.map((item) => `${item.value.degree || "Education"} · ${item.value.institution}`);
};

export function ResumeReview() {
  const [resume, setResume] = useState<MasterResume>();
  const [profile, setProfile] = useState<CandidateProfile>();
  const [values, setValues] = useState<Record<FlatKey, string>>({} as Record<FlatKey, string>);
  const [accepted, setAccepted] = useState<Set<FlatKey>>(new Set());
  const [collections, setCollections] = useState({ skills: true, experience: true, projects: true, education: true });
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const [reviewConflicts, setReviewConflicts] = useState<ProfileMergeConflict[]>([]);

  useEffect(() => { void fetch("/api/resume/review").then((response) => response.json()).then((data: { profile?: CandidateProfile; resume?: MasterResume; review?: { conflicts: ProfileMergeConflict[] } }) => {
    if (!data.resume) { setStatus("error"); setMessage("Upload a master resume first."); return; }
    setResume(data.resume); setProfile(data.profile); setReviewConflicts(data.review?.conflicts ?? []);
    const nextValues = {} as Record<FlatKey, string>; const nextAccepted = new Set<FlatKey>();
    for (const item of fields) {
      const current = data.profile?.[item.key as keyof CandidateProfile];
      const extracted = extractedFor(data.resume.parsedData, item)?.value;
      nextValues[item.key] = String(current ?? extracted ?? "");
      if ((current === undefined || current === "" || current === 0) && extracted !== undefined) nextAccepted.add(item.key);
    }
    setValues(nextValues); setAccepted(nextAccepted); setStatus("ready");
  }).catch(() => { setStatus("error"); setMessage("Could not load the resume import."); }); }, []);

  const conflictCount = useMemo(() => reviewConflicts.length, [reviewConflicts]);
  if (status === "loading") return <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-cyan-300"/></div>;
  if (!resume) return <Card className="p-8"><p>{message}</p><Button asChild><Link href="/profile">Return to profile</Link></Button></Card>;

  const acceptNonConflicting = () => setAccepted(new Set(fields.filter((item) => { const current = profile?.[item.key as keyof CandidateProfile]; return current === undefined || current === "" || current === 0; }).map((item) => item.key)));
  async function confirm() {
    if (!resume) return;
    setStatus("saving"); setMessage("");
    const value = <T,>(key: FlatKey, fallback: T): T | string => accepted.has(key) ? values[key] : (profile?.[key as keyof CandidateProfile] as T ?? fallback);
    const parsed = resume.parsedData;
    const payload = {
      fullName: value("fullName", ""), preferredName: profile?.preferredName ?? "", email: value("email", ""), phone: value("phone", ""), city: value("city", ""), country: value("country", ""), timezone: profile?.timezone ?? "Asia/Kolkata",
      linkedInUrl: value("linkedInUrl", ""), githubUrl: value("githubUrl", ""), portfolioUrl: value("portfolioUrl", ""), websiteUrl: profile?.websiteUrl ?? "",
      currentEmployer: value("currentEmployer", ""), currentRole: value("currentRole", ""), totalYearsExperience: Number(value("totalYearsExperience", 0)), noticePeriod: profile?.noticePeriod ?? "", currentCompensation: profile?.currentCompensation ?? "", expectedCompensation: profile?.expectedCompensation ?? "", preferredSalaryRange: profile?.preferredSalaryRange ?? "", currency: profile?.currency ?? "INR",
      employmentTypes: profile?.employmentTypes ?? ["FULL_TIME"], remoteOnly: true, allowedRegions: profile?.allowedRegions ?? ["India", "Worldwide", "APAC"], workAuthorization: profile?.workAuthorization ?? "", sponsorshipRequired: profile?.sponsorshipRequired ?? "UNKNOWN", relocationWillingness: profile?.relocationWillingness ?? "CASE_BY_CASE", timezoneFlexibility: profile?.timezoneFlexibility ?? "",
      skills: collections.skills ? mergeUnique(profile?.skills ?? [], parsed.skills.map((item) => ({ name: item.value })), (item) => item.name.toLowerCase()) : profile?.skills ?? [],
      experience: collections.experience ? mergeUnique(profile?.experience ?? [], parsed.experience.map((item) => item.value), (item) => `${item.company}|${item.role}|${item.startDate}`.toLowerCase()) : profile?.experience ?? [],
      projects: collections.projects ? mergeUnique(profile?.projects ?? [], parsed.projects.map((item) => item.value), (item) => item.name.toLowerCase()) : profile?.projects ?? [],
      education: collections.education ? mergeUnique(profile?.education ?? [], parsed.education.map((item) => item.value), (item) => `${item.institution}|${item.degree}|${item.field}`.toLowerCase()) : profile?.education ?? []
    };
    const response = await fetch("/api/resume/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) { setStatus("saved"); setMessage("Imported profile verified. This data is now the candidate source of truth."); }
    else { const data = await response.json() as { error?: string }; setStatus("error"); setMessage(data.error ?? "Could not verify the import."); }
  }

  return <div className="space-y-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><Badge className="mb-3 border-cyan-300/20 text-cyan-200">Resume import</Badge><h1 className="m-0 text-3xl font-semibold">Review extracted profile</h1><p className="mt-2 text-sm text-slate-400">Compare existing verified information with locally extracted resume facts.</p></div><Button variant="secondary" onClick={acceptNonConflicting}>Accept all non-conflicting</Button></div>
    {conflictCount > 0 && <div className="rounded-xl border border-amber-300/20 bg-amber-300/[.07] p-4 text-sm text-amber-100">Review required: {conflictCount} extracted {conflictCount === 1 ? "field conflicts" : "fields conflict"} with the current profile.</div>}
    {message && <div className={`rounded-xl border p-4 text-sm ${status === "saved" ? "border-emerald-300/20 bg-emerald-300/[.07] text-emerald-100" : "border-red-300/20 bg-red-300/[.07] text-red-100"}`}>{message}</div>}
    <Card className="overflow-hidden"><div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b border-white/[.07] px-5 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><span>Field</span><span>Current profile</span><span>Resume extraction</span><span>Use</span></div>{fields.map((item) => { const extracted = extractedFor(resume.parsedData, item); const current = profile?.[item.key as keyof CandidateProfile]; const conflict = current !== undefined && current !== "" && extracted && String(current) !== String(extracted.value); return <div className={`grid grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b border-white/[.05] px-5 py-4 last:border-0 ${conflict ? "bg-amber-300/[.025]" : ""}`} key={item.key}><div className="text-sm font-medium">{item.label}{conflict && <div className="mt-1 text-[10px] font-bold uppercase text-amber-300">Conflict</div>}</div><div className="truncate text-sm text-slate-500">{String(current ?? "—")}</div><div><input className="control py-2 text-sm" value={values[item.key] ?? ""} onChange={(event) => setValues({ ...values, [item.key]: event.target.value })}/>{extracted && <div className="mt-1 text-[10px] text-slate-600">{Math.round(extracted.confidence * 100)}% confidence · resume</div>}</div><input aria-label={`Accept ${item.label}`} type="checkbox" checked={accepted.has(item.key)} onChange={(event) => { const next = new Set(accepted); if (event.target.checked) next.add(item.key); else next.delete(item.key); setAccepted(next); }}/></div>; })}</Card>
    <div className="grid gap-4 md:grid-cols-2">{(["skills","experience","projects","education"] as const).map((name) => {
      const labels = collectionLabels(resume.parsedData, name);
      return <Card className="p-4" key={name}><label className="flex items-center justify-between gap-3"><span><span className="block text-sm font-semibold capitalize">{name}</span><span className="mt-1 block text-xs text-slate-500">{labels.length} extracted</span></span><input type="checkbox" checked={collections[name]} onChange={(event) => setCollections({ ...collections, [name]: event.target.checked })}/></label>{labels.length > 0 && <ul className="mb-0 mt-3 space-y-1 border-t border-white/[.06] pt-3 text-xs text-slate-400">{labels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>}</Card>;
    })}</div>
    {resume.parsedData.warnings.length > 0 && <Card className="p-5"><h2 className="mt-0 text-sm font-semibold">Parsing notes</h2><ul className="mb-0 text-sm text-slate-400">{resume.parsedData.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Card>}
    <div className="flex justify-end"><Button size="lg" disabled={status === "saving"} onClick={() => void confirm()}>{status === "saving" ? <LoaderCircle className="animate-spin" size={16}/> : status === "saved" ? <Check size={16}/> : <ShieldCheck size={16}/>}Verify imported profile</Button></div>
  </div>;
}

function mergeUnique<T>(current: T[], extracted: T[], key: (item: T) => string): T[] {
  const keys = new Set(current.map(key));
  return [...current, ...extracted.filter((item) => { const value = key(item); if (keys.has(value)) return false; keys.add(value); return true; })];
}
