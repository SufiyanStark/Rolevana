import { SourceHttpClient } from "./http";
import { classifyFrontendRole, classifyRoleCategory, dedupeFingerprint, extractExperienceRequirement, freshnessBucket, normalizeRemoteRegions, normalizeWorkplaceType, sanitizeJobHtml, stableTextHash } from "./normalization";
import type { JobSourceAdapter, JobSourceProvider, NormalizedJob } from "./types";

const date = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value as string | number);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const absoluteUrl = (value: string) => { try { return new URL(value).href; } catch { return value; } };

type BaseJobInput = {
  externalJobId: string; provider: JobSourceProvider; companyName: string; title: string; description: string;
  workplace?: string | undefined; regions?: string | undefined; locations?: string[] | undefined; postedAt?: Date | undefined; updatedAt?: Date | undefined; jobUrl: string; applicationUrl?: string | undefined;
  sourceMetadata?: Record<string, unknown> | undefined; employmentType?: string | undefined; department?: string | undefined; team?: string | undefined;
  salaryMin?: number | undefined; salaryMax?: number | undefined; salaryCurrency?: string | undefined; salaryInterval?: string | undefined; attribution?: string | undefined;
};

function normalized(input: BaseJobInput, discoveredAt = new Date()): NormalizedJob {
  const description = sanitizeJobHtml(input.description);
  const workplaceType = normalizeWorkplaceType(input.workplace, input.regions, input.locations?.join(" "), input.title, description.slice(0, 600));
  const remoteRegions = normalizeRemoteRegions(input.regions, input.locations?.join(" "), input.workplace);
  const frontend = classifyFrontendRole(input.title, description);
  const experience = extractExperienceRequirement(input.title, description);
  const descriptionHash = stableTextHash(description);
  const base = {
    externalJobId: input.externalJobId, source: input.provider, sourceRecordId: input.externalJobId, companyName: input.companyName,
    title: input.title.trim(), description, requirements: [], preferredQualifications: [], workplaceType, remoteRegions,
    locationRestrictions: remoteRegions.filter((region) => region !== "UNKNOWN"), locations: input.locations ?? [],
    discoveredAt, lastSeenAt: discoveredAt, jobUrl: absoluteUrl(input.jobUrl), applicationUrl: absoluteUrl(input.applicationUrl || input.jobUrl),
    canonicalUrl: absoluteUrl(input.applicationUrl || input.jobUrl), sourceMetadata: input.sourceMetadata ?? {}, descriptionHash,
    status: "DISCOVERED" as const, frontendClassification: frontend.classification, roleCategory: classifyRoleCategory(input.title), ...experience, classificationReason: frontend.reason,
    freshness: freshnessBucket(input.postedAt, discoveredAt), sourceReferences: [{ provider: input.provider, sourceRecordId: input.externalJobId, originalUrl: input.jobUrl, ...(input.applicationUrl ? { applicationUrl: input.applicationUrl } : {}), ...(input.attribution ? { attribution: input.attribution } : {}) }]
  };
  return {
    ...base, dedupeFingerprint: dedupeFingerprint({ ...base, descriptionHash }),
    ...(input.postedAt ? { postedAt: input.postedAt } : {}), ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
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

export function parseSupportedBoardUrl(value: string): { provider: "ASHBY" | "GREENHOUSE" | "LEVER"; boardIdentifier: string; baseUrl?: string } | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "jobs.ashbyhq.com" && segments[0]) return { provider: "ASHBY", boardIdentifier: segments[0] };
    if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname) && segments[0]) return { provider: "GREENHOUSE", boardIdentifier: segments[0] };
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname) && segments[0]) return { provider: "LEVER", boardIdentifier: segments[0], baseUrl: url.hostname.startsWith("jobs.eu") ? "https://api.eu.lever.co" : "https://api.lever.co" };
  } catch { return null; }
  return null;
}

export class CompanyCareerPageAdapter {
  readonly provider = "COMPANY_CAREER_PAGE" as const;
  detect(value: string) { return parseSupportedBoardUrl(value) ?? { provider: "COMPANY_CAREER_PAGE" as const, status: "UNSUPPORTED_SOURCE" as const }; }
}
