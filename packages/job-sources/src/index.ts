export type NormalizedJob = {
  externalJobId: string; source: string; companyName: string; title: string; description: string;
  workplaceType: "REMOTE" | "HYBRID" | "ONSITE"; remoteRegions: string[]; locations: string[];
  postedAt: Date; discoveredAt: Date; applicationUrl: string; jobUrl: string; canonicalUrl: string;
  salary?: { min: number; max: number; currency: string };
};

export interface JobSourceAdapter<TRaw = unknown> {
  readonly id: string;
  searchJobs(since: Date): Promise<TRaw[]>;
  getJobDetails(externalJobId: string): Promise<TRaw>;
  normalizeJob(raw: TRaw): NormalizedJob;
  getApplicationUrl(raw: TRaw): string;
}

const mockJobs: NormalizedJob[] = [
  { externalJobId: "mock-001", source: "mock", companyName: "Northstar Labs", title: "Senior Frontend Engineer", description: "Remote React and TypeScript role building accessible product experiences.", workplaceType: "REMOTE", remoteRegions: ["Worldwide"], locations: ["Remote"], postedAt: new Date("2026-09-25T17:10:00Z"), discoveredAt: new Date("2026-09-25T17:14:00Z"), applicationUrl: "https://example.com/jobs/mock-001/apply", jobUrl: "https://example.com/jobs/mock-001", canonicalUrl: "https://example.com/jobs/mock-001", salary: { min: 90000, max: 120000, currency: "USD" } },
  { externalJobId: "mock-002", source: "mock", companyName: "Kiteworks", title: "React Engineer", description: "Remote APAC React engineer working on design systems.", workplaceType: "REMOTE", remoteRegions: ["APAC"], locations: ["APAC"], postedAt: new Date("2026-09-25T16:44:00Z"), discoveredAt: new Date("2026-09-25T16:49:00Z"), applicationUrl: "https://example.com/jobs/mock-002/apply", jobUrl: "https://example.com/jobs/mock-002", canonicalUrl: "https://example.com/jobs/mock-002" },
  { externalJobId: "mock-003", source: "mock", companyName: "Pixel Harbor", title: "Frontend Developer", description: "Remote US-only frontend position.", workplaceType: "REMOTE", remoteRegions: ["US"], locations: ["United States"], postedAt: new Date("2026-09-25T15:50:00Z"), discoveredAt: new Date("2026-09-25T15:52:00Z"), applicationUrl: "https://example.com/jobs/mock-003/apply", jobUrl: "https://example.com/jobs/mock-003", canonicalUrl: "https://example.com/jobs/mock-003" }
];

export class MockJobSourceAdapter implements JobSourceAdapter<NormalizedJob> {
  readonly id = "mock";
  async searchJobs(since: Date) { return mockJobs.filter((job) => job.discoveredAt >= since); }
  async getJobDetails(externalJobId: string) { const job = mockJobs.find((item) => item.externalJobId === externalJobId); if (!job) throw new Error("Mock job not found"); return job; }
  normalizeJob(raw: NormalizedJob) { return raw; }
  getApplicationUrl(raw: NormalizedJob) { return raw.applicationUrl; }
}

export const phaseOneMockJobs = mockJobs;

