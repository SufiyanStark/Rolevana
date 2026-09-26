import { dedupeFingerprint, freshnessBucket, stableTextHash } from "./normalization";
import type { JobSourceAdapter, NormalizedJob } from "./types";

const mockInput = [
  { id: "mock-001", company: "Northstar Labs", title: "Senior Frontend Engineer", description: "Remote worldwide React and TypeScript role building accessible product experiences.", regions: ["REMOTE_WORLDWIDE" as const], locations: ["Remote"], postedAt: "2026-09-25T17:10:00Z", discoveredAt: "2026-09-25T17:14:00Z" },
  { id: "mock-002", company: "Kiteworks", title: "React Engineer", description: "Remote APAC React engineer working on design systems.", regions: ["REMOTE_APAC" as const], locations: ["APAC"], postedAt: "2026-09-25T16:44:00Z", discoveredAt: "2026-09-25T16:49:00Z" },
  { id: "mock-003", company: "Pixel Harbor", title: "Frontend Developer", description: "Remote US-only frontend position.", regions: ["REMOTE_US_ONLY" as const], locations: ["United States"], postedAt: "2026-09-25T15:50:00Z", discoveredAt: "2026-09-25T15:52:00Z" }
];
const mockJobs: NormalizedJob[] = mockInput.map((item) => {
  const descriptionHash = stableTextHash(item.description);
  const base = { externalJobId: item.id, source: "MOCK" as const, sourceRecordId: item.id, companyName: item.company, title: item.title, description: item.description, requirements: [], preferredQualifications: [], workplaceType: "REMOTE" as const, remoteRegions: item.regions, locationRestrictions: item.regions, locations: item.locations, postedAt: new Date(item.postedAt), discoveredAt: new Date(item.discoveredAt), lastSeenAt: new Date(item.discoveredAt), applicationUrl: `https://example.com/jobs/${item.id}/apply`, jobUrl: `https://example.com/jobs/${item.id}`, canonicalUrl: `https://example.com/jobs/${item.id}`, sourceMetadata: {}, descriptionHash, status: "QUALIFIED_BY_FILTER" as const, frontendClassification: "FRONTEND" as const, roleCategory: "FRONTEND_ENGINEERING", seniority: item.title.startsWith("Senior") ? "SENIOR" as const : "UNKNOWN" as const, classificationReason: "Mock frontend job.", freshness: freshnessBucket(new Date(item.postedAt), new Date(item.discoveredAt)), sourceReferences: [{ provider: "MOCK" as const, sourceRecordId: item.id, originalUrl: `https://example.com/jobs/${item.id}` }] };
  return { ...base, dedupeFingerprint: dedupeFingerprint(base) };
});

export class MockJobSourceAdapter implements JobSourceAdapter<NormalizedJob> {
  readonly id = "mock"; readonly provider = "MOCK" as const; readonly companyName = "Mock source";
  async searchJobs(since?: Date) { return since ? mockJobs.filter((job) => job.discoveredAt >= since) : mockJobs; }
  async getJobDetails(externalJobId: string) { const job = mockJobs.find((item) => item.externalJobId === externalJobId); if (!job) throw new Error("Mock job not found"); return job; }
  normalizeJob(raw: NormalizedJob) { return raw; }
  getApplicationUrl(raw: NormalizedJob) { return raw.applicationUrl; }
}

export const phaseOneMockJobs = mockJobs;
export * from "./types";
export * from "./normalization";
export * from "./http";
export * from "./adapters";
export * from "./discovery";
