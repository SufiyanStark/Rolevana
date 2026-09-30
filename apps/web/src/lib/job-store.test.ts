import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { phaseOneMockJobs } from "@rolevana/job-sources";
import { readJobSourceRegistry, readLocalJobs, registerDetectedCompanySources, upsertLocalJobs } from "./job-store";

describe.sequential("job discovery local store", () => {
  let directory = ""; const userId = "local-development-user";
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "rolevana-jobs-")); process.env.ROLEVANA_LOCAL_DATA_DIR = directory; });
  afterEach(async () => { delete process.env.ROLEVANA_LOCAL_DATA_DIR; await rm(directory, { recursive: true, force: true }); });
  it("updates lastSeenAt on a later scan instead of duplicating the job", async () => {
    const first = { ...phaseOneMockJobs[0]!, lastSeenAt: new Date("2026-01-01T00:00:00Z") };
    const second = { ...first, lastSeenAt: new Date("2026-01-01T01:00:00Z") };
    expect((await upsertLocalJobs(userId, [first])).created).toBe(1);
    const unchanged=await upsertLocalJobs(userId, [second]);
    expect(unchanged.updated).toBe(0);
    expect(unchanged.unchanged).toBe(1);
    expect(unchanged.bySource.MOCK).toEqual({created:0,updated:0,unchanged:1,duplicates:0});
    const jobs = await readLocalJobs(userId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.lastSeenAt.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    const changed={...second,description:"Materially changed React role",descriptionHash:"fnv1a-changed"};
    expect((await upsertLocalJobs(userId,[changed])).updated).toBe(1);
  });
  it("registers a supported ATS URL found outside the primary application URL",async()=>{
    const job={...phaseOneMockJobs[0]!,applicationUrl:"https://aggregator.example/jobs/one",listingUrl:"https://jobs.ashbyhq.com/example-company/job-123",canonicalUrl:"https://aggregator.example/jobs/one",jobUrl:"https://aggregator.example/jobs/one"};
    expect(await registerDetectedCompanySources(userId,[job])).toBe(1);
    const sources=await readJobSourceRegistry(userId);
    expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({provider:"ASHBY",boardIdentifier:"example-company",discoveredFrom:"AUTO_DETECTED"})]));
    expect(await registerDetectedCompanySources(userId,[job])).toBe(0);
  });
});
