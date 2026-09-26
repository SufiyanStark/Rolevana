import { describe, expect, it } from "vitest";
import { MockJobSourceAdapter } from "./index";
describe("mock job source", () => {
  it("returns normalized jobs since the requested scan", async () => {
    const jobs = await new MockJobSourceAdapter().searchJobs(new Date("2026-09-25T16:00:00Z"));
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.workplaceType === "REMOTE")).toBe(true);
  });
});

