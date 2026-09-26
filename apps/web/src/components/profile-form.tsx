"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@rolevana/ui";
import { Check, ChevronDown, FileUp, LoaderCircle, Plus, Save, Search, ShieldCheck, X } from "lucide-react";
import type { CandidateProfile, MasterResume, ProfileMergeSummary, RoleCatalogEntry } from "@rolevana/domain";
import { searchRoleCatalog, roleCategories } from "@rolevana/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { profileAfterResumeUpload } from "@/lib/profile-form-state";

type FormState = "idle" | "saving" | "saved" | "error";
const sections = ["Personal", "Career", "Preferences", "Skills", "Experience", "Resume"];

function RoleDropdown({ value, category, onChange }: { value: string; category: string; onChange: (title: string, category: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RoleCatalogEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setResults(searchRoleCatalog(query || value, 15)); }, [query, value]);
  useEffect(() => {
    const handler = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = useCallback((entry: RoleCatalogEntry) => { onChange(entry.title, entry.category); setQuery(""); setOpen(false); }, [onChange]);
  const selectCustom = useCallback(() => {
    if (!query.trim()) return;
    const match = searchRoleCatalog(query, 1)[0];
    onChange(query.trim(), match?.category ?? "OTHER");
    setOpen(false);
    setQuery("");
  }, [query, onChange]);

  return <div className="field relative" ref={ref}>
    <label>Target role</label>
    <div className="relative">
      <button type="button" className="control flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className={value ? "" : "text-slate-500"}>{value || "Select target role…"}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-500"/>
      </button>
    </div>
    {open && <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2">
        <Search size={14} className="text-slate-500"/>
        <input className="w-full border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" placeholder="Search roles or type custom…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const top = results[0]; top ? select(top) : selectCustom(); }}} autoFocus/>
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {results.map((entry) => <button type="button" className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-white/[.05] ${entry.title === value ? "bg-cyan-300/10 text-cyan-200" : "text-slate-300"}`} key={entry.title} onClick={() => select(entry)}>
          <span>{entry.title}</span>
          <span className="text-[10px] text-slate-500">{entry.category.replace(/_/g, " ")}</span>
        </button>)}
        {query.trim() && !results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase()) && <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-cyan-300 transition hover:bg-white/[.05]" onClick={selectCustom}>
          <Plus size={14}/> Use custom: "{query.trim()}"
        </button>}
        {!results.length && !query.trim() && <div className="px-3 py-4 text-center text-xs text-slate-500">Type to search roles</div>}
      </div>
    </div>}
    {value && <div className="mt-1 text-[10px] text-slate-500">Category: {category.replace(/_/g, " ")}</div>}
  </div>;
}

export function ProfileForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>("idle");
  const [active, setActive] = useState("Personal");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [resumeName, setResumeName] = useState<string>();
  const [resumeInfo, setResumeInfo] = useState<MasterResume>();
  const [profile, setProfile] = useState<CandidateProfile>();
  const [mergeInfo, setMergeInfo] = useState<ProfileMergeSummary>();
  const [targetRole, setTargetRole] = useState("");
  const [targetCategory, setTargetCategory] = useState("OTHER");
  const formRef = useRef<HTMLFormElement>(null);

  function showProfile(next: CandidateProfile) {
    setProfile(next); setSkills(next.skills.map((skill) => skill.name));
    setTargetRole(next.primaryTargetRoleTitle ?? "");
    setTargetCategory(next.primaryTargetRoleCategory ?? "OTHER");
    for (const [name, value] of Object.entries(next)) {
      const input = formRef.current?.elements.namedItem(name);
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) input.value = String(value ?? "");
    }
  }

  useEffect(() => { void Promise.all([fetch("/api/profile"), fetch("/api/resume")]).then(async ([profileResponse, resumeResponse]) => {
    const profileData = await profileResponse.json() as { profile?: CandidateProfile };
    const resumeData = await resumeResponse.json() as { resume?: MasterResume };
    if (profileData.profile) showProfile(profileData.profile);
    if (resumeData.resume) { setResumeInfo(resumeData.resume); setResumeName(resumeData.resume.originalFileName); }
  }).catch(() => setState("error")); }, []);

  async function saveProfile() {
    if (!formRef.current) return;
    setState("saving");
    const data = new FormData(formRef.current);
    const payload = {
      fullName: data.get("fullName"), preferredName: data.get("preferredName") ?? "", email: data.get("email"), phone: data.get("phone"), city: data.get("city"), country: data.get("country"), timezone: data.get("timezone"),
      linkedInUrl: data.get("linkedInUrl") ?? "", githubUrl: data.get("githubUrl") ?? "", portfolioUrl: data.get("portfolioUrl") ?? "", websiteUrl: profile?.websiteUrl ?? "",
      currentEmployer: data.get("currentEmployer") ?? "", currentRole: data.get("currentRole") ?? "", totalYearsExperience: Number(data.get("totalYearsExperience") ?? 0), noticePeriod: data.get("noticePeriod") ?? "", currentCompensation: profile?.currentCompensation ?? "", expectedCompensation: data.get("expectedCompensation") ?? "", preferredSalaryRange: profile?.preferredSalaryRange ?? "", currency: data.get("currency") ?? "INR",
      employmentTypes: profile?.employmentTypes ?? ["FULL_TIME"], remoteOnly: true, allowedRegions: profile?.allowedRegions ?? ["India", "Worldwide", "APAC"], workAuthorization: data.get("workAuthorization") ?? "", sponsorshipRequired: data.get("sponsorshipRequired") ?? "UNKNOWN", relocationWillingness: profile?.relocationWillingness ?? "CASE_BY_CASE", timezoneFlexibility: data.get("timezoneFlexibility") ?? "",
      primaryTargetRoleTitle: targetRole,
      primaryTargetRoleCategory: targetCategory,
      secondaryTargetRoles: profile?.secondaryTargetRoles ?? [],
      includeRelatedTitles: profile?.includeRelatedTitles ?? true,
      experienceToleranceYears: profile?.experienceToleranceYears ?? 1,
      minimumSeniority: profile?.minimumSeniority ?? "UNKNOWN",
      maximumSeniority: profile?.maximumSeniority ?? "UNKNOWN",
      skills: skills.map((name) => ({ name })), experience: profile?.experience ?? [], projects: profile?.projects ?? [], education: profile?.education ?? []
    };
    const response = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) { setProfile(payload as CandidateProfile); setState("saved"); } else setState("error");
  }

  async function uploadResume(file?: File) {
    if (!file) return;
    const body = new FormData(); body.set("resume", file);
    const response = await fetch("/api/resume", { method: "POST", body });
    const data = await response.json() as { resume?: MasterResume; mergedProfile?: CandidateProfile; profileMerge?: ProfileMergeSummary };
    if (response.ok && data.resume) {
      setResumeName(file.name); setResumeInfo(data.resume);
      const nextProfile = profileAfterResumeUpload(profile, data);
      if (nextProfile) showProfile(nextProfile);
      setMergeInfo(data.profileMerge); setState("saved"); router.refresh();
    } else setState("error");
  }

  const addSkill = () => { const value = skillDraft.trim(); if (value && !skills.includes(value)) setSkills([...skills, value]); setSkillDraft(""); };

  return <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><Badge className="mb-3 border-cyan-300/20 text-cyan-200">Source of truth</Badge><h1 className="m-0 text-3xl font-semibold tracking-[-.03em]">Candidate profile</h1><p className="mb-0 mt-2 max-w-2xl text-sm text-slate-400">Rolevana uses only information you verify here. Unknown details are always routed for review.</p></div><Button type="submit" disabled={state === "saving"}>{state === "saving" ? <LoaderCircle className="animate-spin" size={16}/> : state === "saved" ? <Check size={16}/> : <Save size={16}/>} {state === "saved" ? "Profile saved" : "Save profile"}</Button></div>
    {state === "error" && <div role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">Could not save. Check the required fields and try again.</div>}
    <div className="grid gap-5 xl:grid-cols-[210px_1fr]"><Card className="h-fit p-2"><nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-1">{sections.map((section) => <button className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${active === section ? "bg-cyan-300/10 font-semibold text-cyan-200" : "text-slate-500 hover:bg-white/5 hover:text-white"}`} type="button" key={section} onClick={() => setActive(section)} aria-selected={active === section} role="tab">{section}</button>)}</nav></Card>
      <div className="space-y-5">
        <Card className="p-5 md:p-7"><SectionTitle title="Personal information" copy="How employers can identify and contact you."/><div className="grid gap-4 md:grid-cols-2"><Field name="fullName" label="Full name" placeholder="Your legal or professional name" required/><Field name="preferredName" label="Preferred name" placeholder="What should we call you?"/><Field name="email" label="Email" type="email" placeholder="you@example.com" required/><Field name="phone" label="Phone" placeholder="+91 ..." required/><Field name="city" label="Current city" placeholder="Bengaluru" required/><Field name="country" label="Current country" placeholder="India" required/><Field name="timezone" label="Timezone" defaultValue="Asia/Kolkata" required/><div className="field"><label>Remote policy</label><div className="flex h-[43px] items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/[.06] px-3 text-sm text-emerald-200"><ShieldCheck size={16}/>Remote only · locked</div></div></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Online profiles" copy="Used for application fields when you provide them."/><div className="grid gap-4 md:grid-cols-2"><Field name="linkedInUrl" label="LinkedIn" placeholder="https://linkedin.com/in/..."/><Field name="githubUrl" label="GitHub" placeholder="https://github.com/..."/><Field name="portfolioUrl" label="Portfolio" placeholder="https://..."/></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Career information" copy="Compensation and authorization are never inferred."/><div className="grid gap-4 md:grid-cols-2"><Field name="currentEmployer" label="Current employer"/><Field name="currentRole" label="Current role"/><Field name="totalYearsExperience" label="Years of experience" type="number" defaultValue="0" required/><Field name="noticePeriod" label="Notice period" placeholder="30 days"/><Field name="expectedCompensation" label="Expected compensation" placeholder="Optional"/><Select name="currency" label="Currency" options={["INR","USD","EUR","GBP","AED"]}/><Select name="sponsorshipRequired" label="Sponsorship required" options={["UNKNOWN","NO","YES"]}/><Field name="timezoneFlexibility" label="Timezone flexibility" placeholder="e.g. 4 hours overlap with Europe"/><div className="field md:col-span-2"><label>Work authorization — use your exact words</label><textarea className="control min-h-24 resize-y" name="workAuthorization" placeholder="Leave blank if unknown; Rolevana will ask before applying."/></div></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Target role & preferences" copy="Controls what jobs show under For Me. You can change this anytime."/>
          <div className="grid gap-4 md:grid-cols-2">
            <RoleDropdown value={targetRole} category={targetCategory} onChange={(title, cat) => { setTargetRole(title); setTargetCategory(cat); }}/>
            <Field name="experienceToleranceYears" label="Experience tolerance (years)" type="number" defaultValue="1"/>
          </div>
        </Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Technical skills" copy="Add only skills you can discuss honestly."/><div className="flex gap-2"><input className="control" value={skillDraft} onChange={(event) => setSkillDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); }}} placeholder="Add a skill"/><Button type="button" variant="secondary" onClick={addSkill}><Plus size={16}/>Add</Button></div><div className="mt-4 flex flex-wrap gap-2">{skills.map((skill) => <span className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.04] px-3 py-2 text-sm" key={skill}>{skill}<button type="button" aria-label={`Remove ${skill}`} onClick={() => setSkills(skills.filter((item) => item !== skill))} className="border-0 bg-transparent p-0 text-slate-500 hover:text-white"><X size={14}/></button></span>)}</div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Master resume" copy="The original remains unchanged. PDF or DOCX, up to 10 MB."/><label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-white/15 bg-white/[.02] p-9 text-center transition hover:border-cyan-300/40 hover:bg-cyan-300/[.03]"><FileUp size={25} className="mb-3 text-cyan-300"/><span className="text-sm font-semibold">{resumeName ?? "Choose your master resume"}</span><span className="mt-1 text-xs text-slate-500">Stored locally in development; object storage in production</span><input className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void uploadResume(event.target.files?.[0])}/></label>{resumeInfo && <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-4"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300"/><span className="text-sm font-semibold">{resumeInfo.originalFileName}</span><Badge className="text-emerald-200">{resumeInfo.parsingStatus.replaceAll("_", " ")}</Badge></div><div className="mt-2 text-xs text-slate-400">Extracted: {resumeInfo.parsedData.skills.length} skills · {resumeInfo.parsedData.experience.length} experiences · {resumeInfo.parsedData.projects.length} projects · {resumeInfo.parsedData.education.length} education entries</div>{mergeInfo && <div className="mt-2 text-xs text-slate-300">Profile updated: {mergeInfo.fieldsAdded + mergeInfo.skillsAdded + mergeInfo.experienceAdded + mergeInfo.projectsAdded + mergeInfo.educationAdded} items · Needs review: {mergeInfo.conflicts} conflicts</div>}</div><Button asChild variant="secondary"><Link href="/profile/resume-review">Review imported profile</Link></Button></div></div>}</Card>
      </div>
    </div>
  </form>;
}

function SectionTitle({ title, copy }: { title: string; copy: string }) { return <div className="mb-5 border-b border-white/[.06] pb-4"><h2 className="m-0 text-base font-semibold">{title}</h2><p className="mb-0 mt-1 text-xs text-slate-500">{copy}</p></div>; }
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <div className="field"><label htmlFor={props.name}>{label}</label><input id={props.name} className="control" {...props}/></div>; }
function Select({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) { return <div className="field"><label htmlFor={props.name}>{label}</label><select id={props.name} className="control" {...props}>{options.map((option) => <option className="bg-slate-900" key={option}>{option}</option>)}</select></div>; }
