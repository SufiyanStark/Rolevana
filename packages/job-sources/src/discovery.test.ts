import { describe, expect, it, vi } from "vitest";
import { JobDiscoveryService, MockJobSourceAdapter, NonOverlappingDiscoveryScheduler, SourceHttpClient, classifyFrontendRole, deduplicateJobs, filterDiscoveredJob, isRegionEligible, normalizeRemoteRegions, normalizeWorkplaceType, parseSupportedBoardUrl, phaseOneMockJobs, sanitizeJobHtml, type JobSourceAdapter, type NormalizedJob } from "./index";

const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({ ...phaseOneMockJobs[0]!, ...overrides, sourceReferences: overrides.sourceReferences ?? phaseOneMockJobs[0]!.sourceReferences });

describe("deterministic job discovery", () => {
  it.each([["Remote", "REMOTE"], ["Hybrid", "HYBRID"], ["On-site", "ONSITE"]] as const)("normalizes %s workplace", (value, expected) => expect(normalizeWorkplaceType(value)).toBe(expected));
  it("accepts remote jobs and rejects hybrid/onsite jobs", () => {
    expect(filterDiscoveredJob(job(), ["India", "Worldwide", "APAC"]).status).toBe("QUALIFIED_BY_FILTER");
    expect(filterDiscoveredJob(job({ workplaceType: "HYBRID" }), ["Worldwide"]).status).toBe("REJECTED_NOT_REMOTE");
    expect(filterDiscoveredJob(job({ workplaceType: "ONSITE" }), ["Worldwide"]).status).toBe("REJECTED_NOT_REMOTE");
  });
  it.each(["Worldwide", "India", "APAC"])("accepts %s remote eligibility", (region) => expect(isRegionEligible(normalizeRemoteRegions(region), ["India", "Worldwide", "APAC"])).toBe(true));
  it.each(["US only", "EU only"])("rejects %s for the current geography", (region) => expect(isRegionEligible(normalizeRemoteRegions(region), ["India", "Worldwide", "APAC"])).toBe(false));
  it("accepts explicit frontend titles, rejects backend-only, and queues ambiguous titles", () => {
    expect(classifyFrontendRole("Senior Frontend Engineer", "React").classification).toBe("FRONTEND");
    expect(classifyFrontendRole("Java Backend Engineer", "Spring APIs").classification).toBe("NOT_FRONTEND");
    expect(classifyFrontendRole("Software Engineer", "Build product systems").classification).toBe("AMBIGUOUS");
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
