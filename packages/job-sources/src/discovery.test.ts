import { describe, expect, it, vi } from "vitest";
import { AshbyAdapter,detectATS,freshnessBucket,GreenhouseAdapter,JobDiscoveryService, JobicyAdapter,LeverAdapter,MockJobSourceAdapter, NonOverlappingDiscoveryScheduler,parseJobRss,RemoteOKAdapter,RemotiveAdapter,SmartRecruitersAdapter,sourcePollingDecision,SourceHttpClient, classifyFrontendRole, deduplicateJobs, extractExperienceRequirement, filterDiscoveredJob, isRegionEligible, normalizeRemoteRegions, normalizeWorkplaceType, parseSupportedBoardUrl, phaseOneMockJobs, sanitizeJobHtml,WeWorkRemotelyAdapter,WorkableAdapter, type JobSourceAdapter, type JobTargetPreferences, type NormalizedJob } from "./index";
import { sourceFixtures } from "./fixtures/sources";

const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({ ...phaseOneMockJobs[0]!, ...overrides, sourceReferences: overrides.sourceReferences ?? phaseOneMockJobs[0]!.sourceReferences });

describe("deterministic job discovery", () => {
  const frontendTarget: JobTargetPreferences = { selectedRoleTitle: "Frontend Engineer", roleCategory: "FRONTEND_ENGINEERING", relatedTitles: ["React Engineer", "React Developer", "Next.js Engineer", "UI Engineer", "UI Developer"], includeRelatedTitles: true, candidateYearsExperience: 3, experienceToleranceYears: 1 };
  it.each([["Remote", "REMOTE"], ["Hybrid", "HYBRID"], ["On-site", "ONSITE"]] as const)("normalizes %s workplace", (value, expected) => expect(normalizeWorkplaceType(value)).toBe(expected));
  it("accepts remote jobs and rejects hybrid/onsite jobs", () => {
    expect(filterDiscoveredJob(job(), ["India", "Worldwide", "APAC"]).status).toBe("QUALIFIED_BY_FILTER");
    expect(filterDiscoveredJob(job({ workplaceType: "HYBRID" }), ["Worldwide"]).status).toBe("REJECTED_NOT_REMOTE");
    expect(filterDiscoveredJob(job({ workplaceType: "ONSITE" }), ["Worldwide"]).status).toBe("REJECTED_NOT_REMOTE");
  });
  it.each(["Worldwide", "India", "APAC"])("accepts %s remote eligibility", (region) => expect(isRegionEligible(normalizeRemoteRegions(region), ["India", "Worldwide", "APAC"])).toBe(true));
  it.each(["US only", "EU only"])("rejects %s for the current geography", (region) => expect(isRegionEligible(normalizeRemoteRegions(region), ["India", "Worldwide", "APAC"])).toBe(false));
  it("maps explicit countries to known regions without guessing unknown locations", () => {
    expect(normalizeRemoteRegions("Singapore")).toEqual(["REMOTE_APAC"]);
    expect(normalizeRemoteRegions("Ireland")).toEqual(["REMOTE_EU_ONLY"]);
    expect(normalizeRemoteRegions("Remote")).toEqual(["UNKNOWN"]);
  });
  it("accepts explicit frontend titles, rejects backend-only, and queues ambiguous titles", () => {
    expect(classifyFrontendRole("Senior Frontend Engineer", "React").classification).toBe("FRONTEND");
    expect(classifyFrontendRole("Java Backend Engineer", "Spring APIs").classification).toBe("NOT_FRONTEND");
    expect(classifyFrontendRole("Software Engineer", "Build product systems").classification).toBe("AMBIGUOUS");
  });
  it.each(["Frontend Engineer", "Front End Engineer", "Frontend Developer", "Front End Developer", "React Engineer", "React Developer", "Next.js Engineer", "Next.js Developer", "UI Engineer", "UI Developer", "Software Engineer - Frontend", "Software Engineer, Frontend"])("deterministically accepts the obvious target title %s", (title) => {
    expect(filterDiscoveredJob(job({ title, roleCategory: "FRONTEND_ENGINEERING",seniority:"UNKNOWN", workplaceType: "REMOTE", remoteRegions: ["REMOTE_WORLDWIDE"] }), ["India", "Worldwide", "APAC"], frontendTarget).status).toBe("QUALIFIED_BY_FILTER");
  });
  it("keeps a known target role with unknown geography out of the AI-wait state", () => {
    expect(filterDiscoveredJob(job({ title: "Frontend Engineer", roleCategory: "FRONTEND_ENGINEERING", workplaceType: "REMOTE", remoteRegions: ["UNKNOWN"] }), ["India", "Worldwide", "APAC"], frontendTarget).status).toBe("NEEDS_CLASSIFICATION");
  });
  it("routes a mixed senior React title to classification instead of qualifying on an embedded alias",()=>{
    const result=filterDiscoveredJob(job({title:"Senior Java & React Developer",roleCategory:"FRONTEND_ENGINEERING",seniority:"SENIOR",minimumYearsExperience:3,workplaceType:"REMOTE",remoteRegions:["REMOTE_WORLDWIDE"]}),["India","Worldwide","APAC"],frontendTarget);
    expect(result).toMatchObject({status:"NEEDS_CLASSIFICATION"});
    expect(result.classificationReason).toContain("ambiguous target match");
  });
  it("requires classification for seniority without explicit experience but accepts an explicit three-year senior frontend role",()=>{
    expect(filterDiscoveredJob(job({title:"Senior Frontend Engineer",roleCategory:"FRONTEND_ENGINEERING",seniority:"SENIOR",minimumYearsExperience:undefined,workplaceType:"REMOTE",remoteRegions:["REMOTE_WORLDWIDE"]}),["India","Worldwide","APAC"],frontendTarget)).toMatchObject({status:"NEEDS_CLASSIFICATION",classificationReason:expect.stringContaining("SENIORITY_RISK")});
    expect(filterDiscoveredJob(job({title:"Senior Frontend Engineer",roleCategory:"FRONTEND_ENGINEERING",seniority:"SENIOR",minimumYearsExperience:3,workplaceType:"REMOTE",remoteRegions:["REMOTE_WORLDWIDE"]}),["India","Worldwide","APAC"],frontendTarget).status).toBe("QUALIFIED_BY_FILTER");
  });
  it("extracts common deterministic experience requirements", () => {
    expect(extractExperienceRequirement("Frontend Engineer", "Requires 3+ years of professional software engineering experience.").minimumYearsExperience).toBe(3);
    expect(extractExperienceRequirement("Senior Frontend Engineer", "Experience: 8+ years building web applications.").minimumYearsExperience).toBe(8);
    expect(extractExperienceRequirement("Frontend Engineer", "Requires 3–5 years of experience.")).toMatchObject({ minimumYearsExperience: 3, maximumYearsExperience: 5 });
    expect(extractExperienceRequirement("Frontend Engineer", "An invalid 4–40 years range should not become an eligibility rule.").minimumYearsExperience).toBeUndefined();
  });
  it("sanitizes executable job HTML while preserving meaningful text", () => {
    const value = sanitizeJobHtml('<h2>Role</h2><script>alert(1)</script><ul><li onclick="bad()">React</li></ul>');
    expect(value).toContain("Role"); expect(value).toContain("React"); expect(value).not.toMatch(/script|onclick|alert/);
  });
  it("deduplicates cross-source references into one canonical job", () => {
    const first = job();
    const second = job({ source: "GREENHOUSE",sourceType:"DIRECT_ATS", externalJobId: "gh-1", canonicalUrl: first.canonicalUrl, sourceReferences: [{ provider: "GREENHOUSE", sourceRecordId: "gh-1", originalUrl: first.canonicalUrl }] });
    const result = deduplicateJobs([first, second]);
    expect(result.jobs).toHaveLength(1); expect(result.duplicates).toBe(1); expect(result.jobs[0]?.source).toBe("GREENHOUSE");expect(result.jobs[0]?.sourceReferences).toHaveLength(2);
  });
  it("merges the same ATS job but preserves separate ATS openings",()=>{const aggregator=job({source:"JOBICY",sourceType:"PUBLIC_API",atsProvider:"LEVER",atsJobId:"one",canonicalUrl:"https://jobicy.com/one",sourceReferences:[{provider:"JOBICY",sourceRecordId:"j1",originalUrl:"https://jobicy.com/one"}]});const direct=job({source:"LEVER",sourceType:"DIRECT_ATS",atsProvider:"LEVER",atsJobId:"one",canonicalUrl:"https://jobs.lever.co/acme/one",sourceReferences:[{provider:"LEVER",sourceRecordId:"one",originalUrl:"https://jobs.lever.co/acme/one"}]});const separate=job({source:"LEVER",sourceType:"DIRECT_ATS",atsProvider:"LEVER",atsJobId:"two",externalJobId:"two",canonicalUrl:"https://jobs.lever.co/acme/two",dedupeFingerprint:"separate",sourceReferences:[{provider:"LEVER",sourceRecordId:"two",originalUrl:"https://jobs.lever.co/acme/two"}]});const result=deduplicateJobs([aggregator,direct,separate]);expect(result.jobs).toHaveLength(2);expect(result.jobs.find((item)=>item.atsJobId==="one")).toMatchObject({source:"LEVER"});expect(result.jobs.find((item)=>item.atsJobId==="one")?.sourceReferences).toHaveLength(2);});
  it("keeps posted and discovered timestamps distinct", () => expect(job().postedAt?.getTime()).not.toBe(job().discoveredAt.getTime()));
  it("parses supported ATS board URLs", () => {
    expect(parseSupportedBoardUrl("https://jobs.ashbyhq.com/example")?.boardIdentifier).toBe("example");
    expect(parseSupportedBoardUrl("https://boards.greenhouse.io/acme/jobs/1")?.provider).toBe("GREENHOUSE");
    expect(parseSupportedBoardUrl("https://jobs.lever.co/acme")?.provider).toBe("LEVER");
    expect(parseSupportedBoardUrl("https://jobs.smartrecruiters.com/acme/1")?.provider).toBe("SMARTRECRUITERS");
    expect(parseSupportedBoardUrl("https://apply.workable.com/acme/j/1")?.provider).toBe("WORKABLE");
  });
  it.each([["https://boards.greenhouse.io/acme/jobs/1","GREENHOUSE"],["https://jobs.lever.co/acme/1","LEVER"],["https://jobs.eu.lever.co/acme/1","LEVER"],["https://jobs.ashbyhq.com/acme/1","ASHBY"],["https://jobs.smartrecruiters.com/acme/1","SMARTRECRUITERS"],["https://apply.workable.com/acme/j/1","WORKABLE"],["https://acme.example/careers","UNKNOWN"],["not a url","UNKNOWN"]] as const)("detects ATS %s",(url,provider)=>expect(detectATS(url).provider).toBe(provider));
  it("normalizes representative fixtures for every implemented source",()=>{const now=new Date("2026-09-30T01:00:00Z");const jobs=[new RemoteOKAdapter().normalizeJob(sourceFixtures.remoteOk,now),new JobicyAdapter().normalizeJob(sourceFixtures.jobicy,now),new RemotiveAdapter().normalizeJob(sourceFixtures.remotive,now),new GreenhouseAdapter("Acme","acme").normalizeJob(sourceFixtures.greenhouse,now),new LeverAdapter("Acme","acme").normalizeJob(sourceFixtures.lever,now),new AshbyAdapter("Acme","acme").normalizeJob(sourceFixtures.ashby,now),new SmartRecruitersAdapter("Acme","acme").normalizeJob(sourceFixtures.smartRecruiters,now),new WorkableAdapter("Acme","acme").normalizeJob(sourceFixtures.workable,now),new WeWorkRemotelyAdapter().normalizeJob(parseJobRss(sourceFixtures.wwrRss)[0]!,now)];expect(jobs).toHaveLength(9);expect(jobs.every((item)=>item.title==="Frontend Engineer"&&item.applicationUrl.startsWith("http"))).toBe(true);});
  it("uses exact freshness boundaries and low-confidence first-seen fallback",()=>{const now=new Date("2026-09-30T12:00:00Z");expect(freshnessBucket(new Date("2026-09-30T11:00:01Z"),now)).toBe("JUST_POSTED");expect(freshnessBucket(new Date("2026-09-30T11:00:00Z"),now)).toBe("VERY_FRESH");expect(freshnessBucket(new Date("2026-09-30T06:00:00Z"),now)).toBe("TODAY");expect(freshnessBucket(new Date("2026-09-29T12:00:00Z"),now)).toBe("RECENT");expect(freshnessBucket(new Date("2026-09-27T12:00:00Z"),now)).toBe("OLDER");const{pubDate:_ignored,...withoutDate}=sourceFixtures.jobicy;const fallback=new JobicyAdapter().normalizeJob(withoutDate,now);expect(fallback).toMatchObject({freshness:"JUST_POSTED",timestampConfidence:"LOW"});});
  it("respects due, disabled and cooldown polling states",()=>{const base={enabled:true,health:"HEALTHY" as const};const now=new Date("2026-09-30T12:00:00Z");expect(sourcePollingDecision(base,now).due).toBe(true);expect(sourcePollingDecision({...base,nextSyncAt:"2026-09-30T13:00:00Z"},now)).toMatchObject({due:false,reason:"NOT_DUE"});expect(sourcePollingDecision({...base,enabled:false},now)).toMatchObject({due:false,reason:"DISABLED"});expect(sourcePollingDecision({...base,cooldownUntil:"2026-09-30T13:00:00Z"},now)).toMatchObject({due:false,reason:"COOLDOWN"});});
  it("isolates one source failure and continues other adapters", async () => {
    const failing: JobSourceAdapter = { id: "bad", provider: "ASHBY", companyName: "Bad",sourceType:"DIRECT_ATS",minimumPollIntervalMinutes:60, searchJobs: async () => { throw new Error("offline"); }, getJobDetails: async () => { throw new Error("offline"); }, normalizeJob: () => job(), getApplicationUrl: () => "" };
    const result = await new JobDiscoveryService([failing, new MockJobSourceAdapter()], ["Worldwide", "APAC", "India"]).scan();
    expect(result.runs[0]?.error).toBeTruthy(); expect(result.jobs.length).toBeGreaterThan(0);
  });
  it("retries a transient source failure with bounded backoff", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    await expect(new SourceHttpClient(fetcher, { retries: 1, sleep }).json("https://example.com")).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2); expect(sleep).toHaveBeenCalledTimes(1);
  });
  it("does not overlap scheduler scans", async () => {
    let release: () => void = () => undefined;
    const scan = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const scheduler = new NonOverlappingDiscoveryScheduler(scan);
    const first = scheduler.tick();
    await expect(scheduler.tick()).resolves.toBe(false);
    release(); await expect(first).resolves.toBe(true); expect(scan).toHaveBeenCalledTimes(1);
  });
  it("preserves source attribution and exposes no application submission method", () => {
    expect(job().sourceReferences[0]?.originalUrl).toMatch(/^https:/);
    expect("submitApplication" in new MockJobSourceAdapter()).toBe(false);
  });
});
