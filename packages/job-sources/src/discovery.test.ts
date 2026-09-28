import { describe, expect, it, vi } from "vitest";
import { JobDiscoveryService, MockJobSourceAdapter, NonOverlappingDiscoveryScheduler, SourceHttpClient, classifyFrontendRole, deduplicateJobs, extractExperienceRequirement, filterDiscoveredJob, isRegionEligible, normalizeRemoteRegions, normalizeWorkplaceType, parseSupportedBoardUrl, phaseOneMockJobs, sanitizeJobHtml, type JobSourceAdapter, type JobTargetPreferences, type NormalizedJob } from "./index";

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
    expect(filterDiscoveredJob(job({ title, roleCategory: "FRONTEND_ENGINEERING", workplaceType: "REMOTE", remoteRegions: ["REMOTE_WORLDWIDE"] }), ["India", "Worldwide", "APAC"], frontendTarget).status).toBe("QUALIFIED_BY_FILTER");
  });
  it("keeps a known target role with unknown geography out of the AI-wait state", () => {
    expect(filterDiscoveredJob(job({ title: "Frontend Engineer", roleCategory: "FRONTEND_ENGINEERING", workplaceType: "REMOTE", remoteRegions: ["UNKNOWN"] }), ["India", "Worldwide", "APAC"], frontendTarget).status).toBe("NEEDS_CLASSIFICATION");
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
    const second = job({ source: "GREENHOUSE", externalJobId: "gh-1", canonicalUrl: first.canonicalUrl, sourceReferences: [{ provider: "GREENHOUSE", sourceRecordId: "gh-1", originalUrl: first.canonicalUrl }] });
    const result = deduplicateJobs([first, second]);
    expect(result.jobs).toHaveLength(1); expect(result.duplicates).toBe(1); expect(result.jobs[0]?.sourceReferences).toHaveLength(2);
  });
  it("keeps posted and discovered timestamps distinct", () => expect(job().postedAt?.getTime()).not.toBe(job().discoveredAt.getTime()));
  it("parses supported ATS board URLs", () => {
    expect(parseSupportedBoardUrl("https://jobs.ashbyhq.com/example")?.boardIdentifier).toBe("example");
    expect(parseSupportedBoardUrl("https://boards.greenhouse.io/acme/jobs/1")?.provider).toBe("GREENHOUSE");
    expect(parseSupportedBoardUrl("https://jobs.lever.co/acme")?.provider).toBe("LEVER");
  });
  it("isolates one source failure and continues other adapters", async () => {
    const failing: JobSourceAdapter = { id: "bad", provider: "ASHBY", companyName: "Bad", searchJobs: async () => { throw new Error("offline"); }, getJobDetails: async () => { throw new Error("offline"); }, normalizeJob: () => job(), getApplicationUrl: () => "" };
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
