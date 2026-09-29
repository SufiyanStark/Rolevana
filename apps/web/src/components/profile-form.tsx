"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@rolevana/ui";
import { Check, FileUp, LoaderCircle, Plus, Save, ShieldCheck, X } from "lucide-react";
import type { CandidateProfile, MasterResume, ProfileMergeSummary } from "@rolevana/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { profileAfterResumeUpload } from "@/lib/profile-form-state";
import { RoleDropdown } from "@/components/role-dropdown";
import { PageSkeleton } from "@/components/page-skeleton";

type FormState = "idle" | "saving" | "saved" | "error";
const sections = ["Personal", "Career", "Preferences", "Skills", "Experience", "Resume"];

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
  const [targetRoleSelectionSource, setTargetRoleSelectionSource] = useState<CandidateProfile["targetRoleSelectionSource"]>("RESUME");
  const [workAuthorizations, setWorkAuthorizations] = useState<CandidateProfile["workAuthorizations"]>([]);
  const [loaded, setLoaded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function showProfile(next: CandidateProfile) {
    setProfile(next); setSkills(next.skills.map((skill) => skill.name));
    setTargetRole(next.primaryTargetRoleTitle ?? "");
    setTargetCategory(next.primaryTargetRoleCategory ?? "OTHER");
    setTargetRoleSelectionSource(next.targetRoleSelectionSource ?? "RESUME");
    setWorkAuthorizations(next.workAuthorizations ?? []);
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
  }).catch(() => setState("error")).finally(() => setLoaded(true)); }, []);

  async function saveProfile() {
    if (!formRef.current) return;
    setState("saving");
    const data = new FormData(formRef.current);
    const payload = {
      fullName: data.get("fullName"), preferredName: data.get("preferredName") ?? "", email: data.get("email"), phone: data.get("phone"), city: data.get("city"), country: data.get("country"), timezone: data.get("timezone"),
      linkedInUrl: data.get("linkedInUrl") ?? "", githubUrl: data.get("githubUrl") ?? "", portfolioUrl: data.get("portfolioUrl") ?? "", websiteUrl: profile?.websiteUrl ?? "",
      currentEmployer: data.get("currentEmployer") ?? "", currentRole: data.get("currentRole") ?? "", totalYearsExperience: Number(data.get("totalYearsExperience") ?? 0), noticePeriod: data.get("noticePeriod") ?? "", currentCompensation: profile?.currentCompensation ?? "", expectedCompensation: data.get("expectedCompensation") ?? "", preferredSalaryRange: profile?.preferredSalaryRange ?? "", currency: data.get("currency") ?? "INR",
      employmentTypes: profile?.employmentTypes ?? ["FULL_TIME"], remoteOnly: true, allowedRegions: profile?.allowedRegions ?? ["India", "Worldwide", "APAC"], workAuthorization: profile?.workAuthorization ?? "", sponsorshipRequired: profile?.sponsorshipRequired ?? "UNKNOWN", workAuthorizations, relocationWillingness: profile?.relocationWillingness ?? "CASE_BY_CASE", timezoneFlexibility: data.get("timezoneFlexibility") ?? "",
      primaryTargetRoleTitle: targetRole,
      primaryTargetRoleCategory: targetCategory,
      targetRoleSelectionSource,
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

  if (!loaded) return <PageSkeleton kind="form"/>;
  return <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><Badge className="mb-3 border-cyan-300/20 text-cyan-200">Source of truth</Badge><h1 className="m-0 text-3xl font-semibold tracking-[-.03em]">Candidate profile</h1><p className="mb-0 mt-2 max-w-2xl text-sm text-slate-400">Rolevana uses only information you verify here. Unknown details are always routed for review.</p></div><Button type="submit" disabled={state === "saving"}>{state === "saving" ? <LoaderCircle className="animate-spin" size={16}/> : state === "saved" ? <Check size={16}/> : <Save size={16}/>} {state === "saved" ? "Profile saved" : "Save profile"}</Button></div>
    {state === "error" && <div role="alert" className="mb-5 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">Could not save. Check the required fields and try again.</div>}
    <div className="grid gap-5 xl:grid-cols-[210px_1fr]"><Card className="h-fit p-2"><nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-1">{sections.map((section) => <button className={`rounded-lg px-3 py-2.5 text-left text-sm transition ${active === section ? "bg-cyan-300/10 font-semibold text-cyan-200" : "text-slate-500 hover:bg-white/5 hover:text-white"}`} type="button" key={section} onClick={() => setActive(section)} aria-selected={active === section} role="tab">{section}</button>)}</nav></Card>
      <div className="space-y-5">
        <Card className="p-5 md:p-7"><SectionTitle title="Personal information" copy="How employers can identify and contact you."/><div className="grid gap-4 md:grid-cols-2"><Field name="fullName" label="Full name" placeholder="Your legal or professional name" required/><Field name="preferredName" label="Preferred name" placeholder="What should we call you?"/><Field name="email" label="Email" type="email" placeholder="you@example.com" required/><Field name="phone" label="Phone" placeholder="+91 ..." required/><Field name="city" label="Current city" placeholder="Bengaluru" required/><Field name="country" label="Current country" placeholder="India" required/><Field name="timezone" label="Timezone" defaultValue="Asia/Kolkata" required/><div className="field"><label>Remote policy</label><div className="flex h-[43px] items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/[.06] px-3 text-sm text-emerald-200"><ShieldCheck size={16}/>Remote only · locked</div></div></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Online profiles" copy="Used for application fields when you provide them."/><div className="grid gap-4 md:grid-cols-2"><Field name="linkedInUrl" label="LinkedIn" placeholder="https://linkedin.com/in/..."/><Field name="githubUrl" label="GitHub" placeholder="https://github.com/..."/><Field name="portfolioUrl" label="Portfolio" placeholder="https://..."/></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Career information" copy="Compensation and authorization are never inferred."/><div className="grid gap-4 md:grid-cols-2"><Field name="currentEmployer" label="Current employer"/><Field name="currentRole" label="Current role"/><Field name="totalYearsExperience" label="Years of experience" type="number" defaultValue="0" required/><Field name="noticePeriod" label="Notice period" placeholder="30 days"/><Field name="expectedCompensation" label="Expected compensation" placeholder="Optional"/><Select name="currency" label="Currency" options={["INR","USD","EUR","GBP","AED"]}/><Field name="timezoneFlexibility" label="Timezone flexibility" placeholder="e.g. 4 hours overlap with Europe"/></div><div id="work-authorization" className="mt-6 border-t border-white/[.06] pt-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="m-0 text-sm font-semibold">Work authorization by jurisdiction</h3><p className="mb-0 mt-1 text-xs text-slate-500">Verify each country or region separately. Unknown answers always require review.</p></div><Button type="button" variant="secondary" onClick={()=>setWorkAuthorizations([...workAuthorizations,{jurisdiction:"",status:"UNKNOWN",requiresSponsorship:"UNKNOWN",verified:false}])}><Plus size={14}/>Add region</Button></div><div className="space-y-3">{workAuthorizations.map((item,index)=><div className="grid gap-3 rounded-lg border border-white/10 p-3 md:grid-cols-[1.2fr_1fr_1fr_auto_auto]" key={`${item.jurisdiction}-${index}`}><input aria-label="Jurisdiction" className="control" placeholder="India, US, UAE…" value={item.jurisdiction} onChange={(event)=>setWorkAuthorizations(workAuthorizations.map((value,i)=>i===index?{...value,jurisdiction:event.target.value,verified:false,verifiedAt:undefined}:value))}/><select aria-label="Authorization status" className="control" value={item.status} onChange={(event)=>setWorkAuthorizations(workAuthorizations.map((value,i)=>i===index?{...value,status:event.target.value as typeof value.status,verified:false,verifiedAt:undefined}:value))}><option>UNKNOWN</option><option>AUTHORIZED</option><option>NOT_AUTHORIZED</option></select><select aria-label="Sponsorship requirement" className="control" value={item.requiresSponsorship} onChange={(event)=>setWorkAuthorizations(workAuthorizations.map((value,i)=>i===index?{...value,requiresSponsorship:event.target.value as typeof value.requiresSponsorship,verified:false,verifiedAt:undefined}:value))}><option>UNKNOWN</option><option>NO</option><option>YES</option></select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={item.verified} onChange={(event)=>setWorkAuthorizations(workAuthorizations.map((value,i)=>i===index?{...value,verified:event.target.checked,verifiedAt:event.target.checked?new Date().toISOString():undefined}:value))}/>Verified</label><button type="button" aria-label={`Remove ${item.jurisdiction||"region"}`} onClick={()=>setWorkAuthorizations(workAuthorizations.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div></div></Card>
        <Card className="p-5 md:p-7"><SectionTitle title="Target role & preferences" copy="Controls every Jobs view. You can change this anytime."/>
          <div className="grid gap-4 md:grid-cols-2">
            <RoleDropdown value={targetRole} category={targetCategory} onChange={(title, cat) => { setTargetRole(title); setTargetCategory(cat); setTargetRoleSelectionSource("USER"); }}/>
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
