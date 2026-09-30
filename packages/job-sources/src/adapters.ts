import { SourceHttpClient } from "./http";
import { classifyFrontendRole, classifyRoleCategory, decodeHtmlEntities, dedupeFingerprint, extractExperienceRequirement, freshnessBucket, normalizeRemoteRegions, normalizeWorkplaceType, sanitizeJobHtml, stableTextHash } from "./normalization";
import type { ATSProvider, JobSourceAdapter, JobSourceProvider, JobSourceType, NormalizedJob } from "./types";

const date = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value as string | number);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const absoluteUrl = (value: string) => { try { return new URL(value).href; } catch { return value; } };
const sourceTypeFor = (provider: JobSourceProvider): JobSourceType => ["ASHBY","GREENHOUSE","LEVER","SMARTRECRUITERS","WORKABLE"].includes(provider) ? "DIRECT_ATS" : provider === "WE_WORK_REMOTELY" ? "RSS" : ["LINKEDIN","INDEED","NAUKRI","WELLFOUND","ARC"].includes(provider) ? "PORTAL" : "PUBLIC_API";
export function detectATS(value: string): { provider: ATSProvider; identifier?: string; jobId?: string } {
  const result=(provider:ATSProvider,identifier?:string,jobId?:string)=>({provider,...(identifier?{identifier}:{}),...(jobId?{jobId}:{})});
  try { const url=new URL(value);const parts=url.pathname.split("/").filter(Boolean);const host=url.hostname.toLowerCase();
    if(["boards.greenhouse.io","job-boards.greenhouse.io"].includes(host))return result("GREENHOUSE",parts[0],parts.at(-1));
    if(["jobs.lever.co","jobs.eu.lever.co"].includes(host))return result("LEVER",parts[0],parts[1]);
    if(host==="jobs.ashbyhq.com")return result("ASHBY",parts[0],parts[1]);
    if(host==="jobs.smartrecruiters.com")return result("SMARTRECRUITERS",parts[0],parts.at(-1));
    if(host==="apply.workable.com"||host.endsWith(".workable.com"))return result("WORKABLE",host==="apply.workable.com"?parts[0]:host.split(".")[0],parts.at(-1));
  }catch{return{provider:"UNKNOWN"};}return{provider:"UNKNOWN"};
}

type BaseJobInput = {
  externalJobId: string; provider: JobSourceProvider; companyName: string; title: string; description: string;
  workplace?: string | undefined; regions?: string | undefined; locations?: string[] | undefined; postedAt?: Date | undefined; updatedAt?: Date | undefined; jobUrl: string; applicationUrl?: string | undefined;
  sourceMetadata?: Record<string, unknown> | undefined; employmentType?: string | undefined; department?: string | undefined; team?: string | undefined;
  salaryMin?: number | undefined; salaryMax?: number | undefined; salaryCurrency?: string | undefined; salaryInterval?: string | undefined; attribution?: string | undefined;
};

function normalized(input: BaseJobInput, discoveredAt = new Date()): NormalizedJob {
  const description = sanitizeJobHtml(input.description);
  const title=decodeHtmlEntities(input.title).trim();
  const companyName=decodeHtmlEntities(input.companyName).trim();
  const workplaceType = normalizeWorkplaceType(input.workplace, input.regions, input.locations?.join(" "), input.title, description.slice(0, 600));
  const remoteRegions = normalizeRemoteRegions(input.regions, input.locations?.join(" "), input.workplace);
  const frontend = classifyFrontendRole(title, description);
  const experience = extractExperienceRequirement(title, description);
  const descriptionHash = stableTextHash(description);
  const applicationUrl=absoluteUrl(input.applicationUrl || input.jobUrl);const detected=detectATS(applicationUrl);let applicationHost:string|undefined;try{applicationHost=new URL(applicationUrl).hostname}catch{}
  const sourceType=sourceTypeFor(input.provider);const published=input.postedAt;const timestamp=published??discoveredAt;
  const base = {
    externalJobId: input.externalJobId, source: input.provider, sourceType, sourceRecordId: input.externalJobId, sourceJobId:input.externalJobId,...(detected.provider!=="UNKNOWN"&&detected.jobId?{canonicalJobId:`${detected.provider}:${detected.jobId}`}:{ }), companyName,
    title, normalizedTitle:title.toLowerCase().replace(/front[ -]end/g,"frontend").replace(/\s+/g," ").trim(), description, requirements: [], preferredQualifications: [], workplaceType, remoteType:workplaceType, remoteRegions,
    locationRestrictions: remoteRegions.filter((region) => region !== "UNKNOWN"), locations: input.locations ?? [],
    discoveredAt, firstSeenAt:discoveredAt,lastSeenAt: discoveredAt, jobUrl: absoluteUrl(input.jobUrl),listingUrl:absoluteUrl(input.jobUrl), applicationUrl,...(applicationHost?{applicationHost}:{}),atsProvider:detected.provider,...(detected.jobId?{atsJobId:detected.jobId}:{}),
    canonicalUrl: applicationUrl, sourceMetadata: input.sourceMetadata ?? {}, descriptionHash,
    status: "DISCOVERED" as const, frontendClassification: frontend.classification, roleCategory: classifyRoleCategory(title), ...experience, classificationReason: frontend.reason,
    freshness: freshnessBucket(timestamp, discoveredAt), timestampConfidence:published?"HIGH" as const:"LOW" as const,lifecycleStatus:"ACTIVE" as const, sourceReferences: [{ provider: input.provider, sourceRecordId: input.externalJobId, originalUrl: input.jobUrl, ...(input.applicationUrl ? { applicationUrl: input.applicationUrl } : {}), ...(input.attribution ? { attribution: input.attribution } : {}) }]
  };
  return {
    ...base, dedupeFingerprint: dedupeFingerprint({ ...base, descriptionHash }),
    ...(input.postedAt ? { postedAt: input.postedAt,sourcePublishedAt:input.postedAt } : {}), ...(input.updatedAt ? { updatedAt: input.updatedAt,sourceUpdatedAt:input.updatedAt } : {}),
    ...(input.employmentType ? { employmentType: input.employmentType } : {}), ...(input.department ? { department: input.department } : {}),
    ...(input.team ? { team: input.team } : {}), ...(input.salaryMin !== undefined ? { salaryMin: input.salaryMin } : {}),
    ...(input.salaryMax !== undefined ? { salaryMax: input.salaryMax } : {}), ...(input.salaryCurrency ? { salaryCurrency: input.salaryCurrency } : {}),
    ...(input.salaryInterval ? { salaryInterval: input.salaryInterval } : {})
  };
}

export type RemoteOkJob = { id?: string | number; slug?: string; company?: string; position?: string; description?: string; tags?: string[]; location?: string; date?: string; epoch?: number; url?: string; apply_url?: string; salary_min?: number; salary_max?: number; salary_currency?: string };
export class RemoteOKAdapter implements JobSourceAdapter<RemoteOkJob> {
  readonly id = "remote-ok";
  readonly provider = "REMOTE_OK" as const;
  readonly companyName = "Remote OK";
  readonly sourceType = "PUBLIC_API" as const; readonly minimumPollIntervalMinutes=60;
  constructor(private readonly http = new SourceHttpClient()) {}
  async searchJobs(since?: Date) {
    const raw = await this.http.json<RemoteOkJob[]>("https://remoteok.com/api");
    return raw.filter((item) => item.position && item.company).filter((item) => !since || !date(item.epoch ?? item.date) || (date(item.epoch ?? item.date) as Date) >= since);
  }
  async getJobDetails(externalJobId: string) { const job = (await this.searchJobs()).find((item) => String(item.id ?? item.slug) === externalJobId); if (!job) throw new Error("Remote OK job not found."); return job; }
  normalizeJob(raw: RemoteOkJob, discoveredAt = new Date()) {
    const url = raw.url || `https://remoteok.com/remote-jobs/${raw.slug ?? raw.id}`;
    return normalized({ externalJobId: String(raw.id ?? raw.slug), provider: this.provider, companyName: raw.company ?? "Unknown company", title: raw.position ?? "Untitled role", description: raw.description ?? "", workplace: "remote", regions: raw.location || raw.tags?.join(" "), locations: raw.location ? [raw.location] : ["Remote"], postedAt: date(raw.epoch ?? raw.date), jobUrl: url, applicationUrl: raw.apply_url || url, salaryMin: raw.salary_min, salaryMax: raw.salary_max, salaryCurrency: raw.salary_currency, sourceMetadata: { tags: raw.tags ?? [] }, attribution: "Remote OK — link back to original posting" }, discoveredAt);
  }
  getApplicationUrl(raw: RemoteOkJob) { return raw.apply_url || raw.url || `https://remoteok.com/remote-jobs/${raw.slug ?? raw.id}`; }
}

export type AshbyJob = { id: string; title: string; location?: string; secondaryLocations?: Array<{ location?: string } | string>; workplaceType?: string; descriptionHtml?: string; descriptionPlain?: string; publishedAt?: string; jobUrl?: string; applyUrl?: string; department?: string; team?: string; compensation?: { minValue?: number; maxValue?: number; currencyCode?: string; interval?: string } };
export class AshbyAdapter implements JobSourceAdapter<AshbyJob> {
  readonly provider = "ASHBY" as const;
  readonly id: string;
  readonly sourceType="DIRECT_ATS" as const;readonly minimumPollIntervalMinutes=60;
  constructor(readonly companyName: string, readonly boardIdentifier: string, private readonly http = new SourceHttpClient()) { this.id = `ashby:${boardIdentifier}`; }
  async searchJobs(since?: Date) { const body = await this.http.json<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.boardIdentifier)}?includeCompensation=true`); return (body.jobs ?? []).filter((job) => !since || !date(job.publishedAt) || (date(job.publishedAt) as Date) >= since); }
  async getJobDetails(externalJobId: string) { const job = (await this.searchJobs()).find((item) => item.id === externalJobId); if (!job) throw new Error("Ashby job not found."); return job; }
  normalizeJob(raw: AshbyJob, discoveredAt = new Date()) {
    const secondary = (raw.secondaryLocations ?? []).map((item) => typeof item === "string" ? item : item.location ?? "").filter(Boolean);
    const locations = [raw.location, ...secondary].filter((item): item is string => Boolean(item));
    const jobUrl = raw.jobUrl || `https://jobs.ashbyhq.com/${this.boardIdentifier}/${raw.id}`;
    return normalized({ externalJobId: raw.id, provider: this.provider, companyName: this.companyName, title: raw.title, description: raw.descriptionPlain || raw.descriptionHtml || "", workplace: raw.workplaceType, regions: locations.join(" "), locations, postedAt: date(raw.publishedAt), jobUrl, applicationUrl: raw.applyUrl || jobUrl, department: raw.department, team: raw.team, salaryMin: raw.compensation?.minValue, salaryMax: raw.compensation?.maxValue, salaryCurrency: raw.compensation?.currencyCode, salaryInterval: raw.compensation?.interval, sourceMetadata: { boardIdentifier: this.boardIdentifier } }, discoveredAt);
  }
  getApplicationUrl(raw: AshbyJob) { return raw.applyUrl || raw.jobUrl || `https://jobs.ashbyhq.com/${this.boardIdentifier}/${raw.id}`; }
}

export type GreenhouseJob = { id: number; title: string; updated_at?: string; first_published?: string; location?: { name?: string }; absolute_url: string; content?: string; departments?: Array<{ name?: string }>; offices?: Array<{ name?: string; location?: string }>; pay_input_ranges?: Array<{ min_cents?: number; max_cents?: number; currency_type?: string; title?: string }> };
export class GreenhouseAdapter implements JobSourceAdapter<GreenhouseJob> {
  readonly provider = "GREENHOUSE" as const;
  readonly id: string;
  readonly sourceType="DIRECT_ATS" as const;readonly minimumPollIntervalMinutes=60;
  constructor(readonly companyName: string, readonly boardIdentifier: string, private readonly http = new SourceHttpClient()) { this.id = `greenhouse:${boardIdentifier}`; }
  async searchJobs(since?: Date) { const body = await this.http.json<{ jobs?: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.boardIdentifier)}/jobs?content=true`); return (body.jobs ?? []).filter((job) => !since || !date(job.updated_at) || (date(job.updated_at) as Date) >= since); }
  async getJobDetails(externalJobId: string) { return this.http.json<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.boardIdentifier)}/jobs/${encodeURIComponent(externalJobId)}?pay_transparency=true`); }
  normalizeJob(raw: GreenhouseJob, discoveredAt = new Date()) {
    const locations = [raw.location?.name, ...(raw.offices ?? []).flatMap((office) => [office.name, office.location])].filter((item): item is string => Boolean(item));
    const pay = raw.pay_input_ranges?.[0];
    return normalized({ externalJobId: String(raw.id), provider: this.provider, companyName: this.companyName, title: raw.title, description: raw.content ?? "", workplace: locations.join(" "), regions: locations.join(" "), locations, postedAt: date(raw.first_published), updatedAt: date(raw.updated_at), jobUrl: raw.absolute_url, applicationUrl: raw.absolute_url, department: raw.departments?.map((item) => item.name).filter(Boolean).join(", "), salaryMin: pay?.min_cents !== undefined ? pay.min_cents / 100 : undefined, salaryMax: pay?.max_cents !== undefined ? pay.max_cents / 100 : undefined, salaryCurrency: pay?.currency_type, sourceMetadata: { boardIdentifier: this.boardIdentifier, offices: raw.offices ?? [] } }, discoveredAt);
  }
  getApplicationUrl(raw: GreenhouseJob) { return raw.absolute_url; }
}

export type LeverJob = { id: string; text: string; description?: string; descriptionPlain?: string; hostedUrl: string; applyUrl?: string; createdAt?: number; categories?: { commitment?: string; department?: string; location?: string; team?: string }; workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } };
export class LeverAdapter implements JobSourceAdapter<LeverJob> {
  readonly provider = "LEVER" as const;
  readonly id: string;
  readonly sourceType="DIRECT_ATS" as const;readonly minimumPollIntervalMinutes=60;
  constructor(readonly companyName: string, readonly boardIdentifier: string, readonly baseUrl = "https://api.lever.co", private readonly http = new SourceHttpClient()) { this.id = `lever:${boardIdentifier}`; }
  private endpoint(pathname = "") { return `${this.baseUrl}/v0/postings/${encodeURIComponent(this.boardIdentifier)}${pathname}?mode=json`; }
  async searchJobs(since?: Date) { const jobs = await this.http.json<LeverJob[]>(this.endpoint()); return jobs.filter((job) => !since || !date(job.createdAt) || (date(job.createdAt) as Date) >= since); }
  async getJobDetails(externalJobId: string) { return this.http.json<LeverJob>(this.endpoint(`/${encodeURIComponent(externalJobId)}`)); }
  normalizeJob(raw: LeverJob, discoveredAt = new Date()) {
    const location = raw.categories?.location;
    return normalized({ externalJobId: raw.id, provider: this.provider, companyName: this.companyName, title: raw.text, description: raw.descriptionPlain || raw.description || "", workplace: raw.workplaceType, regions: location, locations: location ? [location] : [], postedAt: date(raw.createdAt), jobUrl: raw.hostedUrl, applicationUrl: raw.applyUrl || raw.hostedUrl, employmentType: raw.categories?.commitment, department: raw.categories?.department, team: raw.categories?.team, salaryMin: raw.salaryRange?.min, salaryMax: raw.salaryRange?.max, salaryCurrency: raw.salaryRange?.currency, salaryInterval: raw.salaryRange?.interval, sourceMetadata: { boardIdentifier: this.boardIdentifier } }, discoveredAt);
  }
  getApplicationUrl(raw: LeverJob) { return raw.applyUrl || raw.hostedUrl; }
}

export type JobicyJob={id?:string|number;jobTitle?:string;companyName?:string;jobDescription?:string;jobGeo?:string;jobType?:string;pubDate?:string;url?:string;jobUrl?:string};
export class JobicyAdapter implements JobSourceAdapter<JobicyJob>{readonly id="jobicy";readonly provider="JOBICY" as const;readonly companyName="Jobicy";readonly sourceType="PUBLIC_API" as const;readonly minimumPollIntervalMinutes=60;constructor(private readonly http=new SourceHttpClient()){}async searchJobs(since?:Date){const body=await this.http.json<{jobs?:JobicyJob[]}>("https://jobicy.com/api/v2/remote-jobs?count=50");return(body.jobs??[]).filter((item)=>!since||!date(item.pubDate)||(date(item.pubDate) as Date)>=since);}async getJobDetails(id:string){const value=(await this.searchJobs()).find((item)=>String(item.id)===id);if(!value)throw new Error("Jobicy job not found.");return value;}normalizeJob(raw:JobicyJob,discoveredAt=new Date()){const url=raw.url||raw.jobUrl||`https://jobicy.com/jobs/${raw.id}`;return normalized({externalJobId:String(raw.id??stableTextHash(`${raw.companyName}|${raw.jobTitle}|${url}`)),provider:this.provider,companyName:raw.companyName??"Unknown company",title:raw.jobTitle??"Untitled role",description:raw.jobDescription??"",workplace:"remote",regions:raw.jobGeo,locations:raw.jobGeo?[raw.jobGeo]:["Remote"],employmentType:raw.jobType,postedAt:date(raw.pubDate),jobUrl:url,applicationUrl:url,attribution:"Jobicy — original public listing"},discoveredAt);}getApplicationUrl(raw:JobicyJob){return raw.url||raw.jobUrl||`https://jobicy.com/jobs/${raw.id}`;}}

export type RemotiveJob={id:number|string;title:string;company_name?:string;description?:string;candidate_required_location?:string;job_type?:string;publication_date?:string;url:string;salary?:string};
export class RemotiveAdapter implements JobSourceAdapter<RemotiveJob>{readonly id="remotive";readonly provider="REMOTIVE" as const;readonly companyName="Remotive";readonly sourceType="PUBLIC_API" as const;readonly minimumPollIntervalMinutes=360;constructor(private readonly http=new SourceHttpClient()){}async searchJobs(since?:Date){const body=await this.http.json<{jobs?:RemotiveJob[]}>("https://remotive.com/api/remote-jobs");return(body.jobs??[]).filter((item)=>!since||!date(item.publication_date)||(date(item.publication_date) as Date)>=since);}async getJobDetails(id:string){const value=(await this.searchJobs()).find((item)=>String(item.id)===id);if(!value)throw new Error("Remotive job not found.");return value;}normalizeJob(raw:RemotiveJob,discoveredAt=new Date()){return normalized({externalJobId:String(raw.id),provider:this.provider,companyName:raw.company_name??"Unknown company",title:raw.title,description:raw.description??"",workplace:"remote",regions:raw.candidate_required_location,locations:raw.candidate_required_location?[raw.candidate_required_location]:["Remote"],employmentType:raw.job_type,postedAt:date(raw.publication_date),jobUrl:raw.url,applicationUrl:raw.url,sourceMetadata:{salary:raw.salary},attribution:"Remotive — original public listing"},discoveredAt);}getApplicationUrl(raw:RemotiveJob){return raw.url;}}

export type RssJob={id:string;title:string;company:string;description:string;location?:string;publishedAt?:string;url:string};
const xmlValue=(value:string,tag:string)=>{const match=value.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,`i`));return match?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g,"").trim()??"";};
export function parseJobRss(xml:string):RssJob[]{return[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match,index)=>{const item=match[1]??"";const rawTitle=xmlValue(item,"title");const parts=rawTitle.split(":");const url=xmlValue(item,"link");const publishedAt=xmlValue(item,"pubDate");return{id:xmlValue(item,"guid")||url||String(index),company:parts.length>1?parts.shift()!.trim():"Unknown company",title:parts.length?parts.join(":").trim():rawTitle,description:xmlValue(item,"description")||xmlValue(item,"content:encoded"),location:xmlValue(item,"region")||xmlValue(item,"location")||"Remote",...(publishedAt?{publishedAt}:{}),url};}).filter((item)=>Boolean(item.title&&item.url));}
export class WeWorkRemotelyAdapter implements JobSourceAdapter<RssJob>{readonly id="we-work-remotely";readonly provider="WE_WORK_REMOTELY" as const;readonly companyName="We Work Remotely";readonly sourceType="RSS" as const;readonly minimumPollIntervalMinutes=60;constructor(private readonly http=new SourceHttpClient(),private readonly feeds=["https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss","https://weworkremotely.com/categories/remote-programming-jobs.rss"]){}async searchJobs(since?:Date){const all=(await Promise.all(this.feeds.map(async(url)=>parseJobRss(await this.http.text(url))))).flat();return all.filter((item)=>!since||!date(item.publishedAt)||(date(item.publishedAt) as Date)>=since);}async getJobDetails(id:string){const value=(await this.searchJobs()).find((item)=>item.id===id);if(!value)throw new Error("WWR job not found.");return value;}normalizeJob(raw:RssJob,discoveredAt=new Date()){return normalized({externalJobId:raw.id,provider:this.provider,companyName:raw.company,title:raw.title,description:raw.description,workplace:"remote",regions:raw.location,locations:raw.location?[raw.location]:["Remote"],postedAt:date(raw.publishedAt),jobUrl:raw.url,applicationUrl:raw.url,attribution:"We Work Remotely RSS — link to original listing"},discoveredAt);}getApplicationUrl(raw:RssJob){return raw.url;}}

export type SmartRecruitersJob={id:string;name:string;releasedDate?:string;updatedDate?:string;ref?:string;location?:{city?:string;region?:string;country?:string;remote?:boolean};company?:{name?:string};jobAd?:{sections?:Record<string,{text?:string}>};typeOfEmployment?:{label?:string}};
export class SmartRecruitersAdapter implements JobSourceAdapter<SmartRecruitersJob>{readonly provider="SMARTRECRUITERS" as const;readonly sourceType="DIRECT_ATS" as const;readonly minimumPollIntervalMinutes=60;readonly id:string;constructor(readonly companyName:string,readonly boardIdentifier:string,private readonly http=new SourceHttpClient()){this.id=`smartrecruiters:${boardIdentifier}`;}async searchJobs(since?:Date){const body=await this.http.json<{content?:SmartRecruitersJob[]}>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(this.boardIdentifier)}/postings?limit=100`);return(body.content??[]).filter((item)=>!since||!date(item.updatedDate??item.releasedDate)||(date(item.updatedDate??item.releasedDate) as Date)>=since);}async getJobDetails(id:string){return this.http.json<SmartRecruitersJob>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(this.boardIdentifier)}/postings/${encodeURIComponent(id)}`);}normalizeJob(raw:SmartRecruitersJob,discoveredAt=new Date()){const location=[raw.location?.city,raw.location?.region,raw.location?.country].filter(Boolean).join(", ");const url=raw.ref||`https://jobs.smartrecruiters.com/${this.boardIdentifier}/${raw.id}`;return normalized({externalJobId:raw.id,provider:this.provider,companyName:raw.company?.name??this.companyName,title:raw.name,description:Object.values(raw.jobAd?.sections??{}).map((item)=>item.text??"").join("\n"),workplace:raw.location?.remote?"remote":location,regions:location,locations:location?[location]:[],postedAt:date(raw.releasedDate),updatedAt:date(raw.updatedDate),jobUrl:url,applicationUrl:url,employmentType:raw.typeOfEmployment?.label,sourceMetadata:{boardIdentifier:this.boardIdentifier}},discoveredAt);}getApplicationUrl(raw:SmartRecruitersJob){return raw.ref||`https://jobs.smartrecruiters.com/${this.boardIdentifier}/${raw.id}`;}}

export type WorkableJob={shortcode?:string;id?:string;title:string;company?:string;description?:string;description_html?:string;location?:{city?:string;region?:string;country?:string;remote?:boolean};employment_type?:string;created_at?:string;published_at?:string;url?:string;application_url?:string};
export class WorkableAdapter implements JobSourceAdapter<WorkableJob>{readonly provider="WORKABLE" as const;readonly sourceType="DIRECT_ATS" as const;readonly minimumPollIntervalMinutes=60;readonly id:string;constructor(readonly companyName:string,readonly boardIdentifier:string,private readonly http=new SourceHttpClient()){this.id=`workable:${boardIdentifier}`;}async searchJobs(since?:Date){const body=await this.http.json<{jobs?:WorkableJob[]}>(`https://www.workable.com/api/accounts/${encodeURIComponent(this.boardIdentifier)}?details=true`);return(body.jobs??[]).filter((item)=>!since||!date(item.published_at??item.created_at)||(date(item.published_at??item.created_at) as Date)>=since);}async getJobDetails(id:string){const value=(await this.searchJobs()).find((item)=>String(item.shortcode??item.id)===id);if(!value)throw new Error("Workable job not found.");return value;}normalizeJob(raw:WorkableJob,discoveredAt=new Date()){const location=[raw.location?.city,raw.location?.region,raw.location?.country].filter(Boolean).join(", ");const id=String(raw.shortcode??raw.id);const url=raw.url||`https://apply.workable.com/${this.boardIdentifier}/j/${id}/`;return normalized({externalJobId:id,provider:this.provider,companyName:raw.company??this.companyName,title:raw.title,description:raw.description??raw.description_html??"",workplace:raw.location?.remote?"remote":location,regions:location,locations:location?[location]:[],employmentType:raw.employment_type,postedAt:date(raw.published_at??raw.created_at),jobUrl:url,applicationUrl:raw.application_url||url,sourceMetadata:{boardIdentifier:this.boardIdentifier}},discoveredAt);}getApplicationUrl(raw:WorkableJob){return raw.application_url||raw.url||`https://apply.workable.com/${this.boardIdentifier}/j/${raw.shortcode??raw.id}/`;}}

export function parseSupportedBoardUrl(value: string): { provider: "ASHBY" | "GREENHOUSE" | "LEVER" | "SMARTRECRUITERS" | "WORKABLE"; boardIdentifier: string; baseUrl?: string } | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "jobs.ashbyhq.com" && segments[0]) return { provider: "ASHBY", boardIdentifier: segments[0] };
    if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) && segments[0]) return { provider: "GREENHOUSE", boardIdentifier: segments[0] };
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname) && segments[0]) return { provider: "LEVER", boardIdentifier: segments[0], baseUrl: url.hostname.startsWith("jobs.eu") ? "https://api.eu.lever.co" : "https://api.lever.co" };
    if (url.hostname === "jobs.smartrecruiters.com" && segments[0]) return { provider: "SMARTRECRUITERS", boardIdentifier: segments[0] };
    if ((url.hostname === "apply.workable.com" || url.hostname.endsWith(".workable.com")) && (segments[0] || url.hostname !== "apply.workable.com")) return { provider: "WORKABLE", boardIdentifier: url.hostname === "apply.workable.com" ? segments[0]! : url.hostname.split(".")[0]! };
  } catch { return null; }
  return null;
}

export class CompanyCareerPageAdapter {
  readonly provider = "COMPANY_CAREER_PAGE" as const;
  detect(value: string) { return parseSupportedBoardUrl(value) ?? { provider: "COMPANY_CAREER_PAGE" as const, status: "UNSUPPORTED_SOURCE" as const }; }
}
