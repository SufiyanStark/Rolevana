import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { phaseOneMockJobs } from "@rolevana/job-sources";
import { readLocalJobs, upsertLocalJobs } from "./job-store";

describe.sequential("job discovery local store", () => {
  let directory = ""; const userId = "local-development-user";
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "rolevana-jobs-")); process.env.ROLEVANA_LOCAL_DATA_DIR = directory; });
  afterEach(async () => { delete process.env.ROLEVANA_LOCAL_DATA_DIR; await rm(directory, { recursive: true, force: true }); });
  it("updates lastSeenAt on a later scan instead of duplicating the job", async () => {
    const first = { ...phaseOneMockJobs[0]!, lastSeenAt: new Date("2026-01-01T00:00:00Z") };
    const second = { ...first, lastSeenAt: new Date("2026-01-01T01:00:00Z") };
    expect((await upsertLocalJobs(userId, [first])).created).toBe(1);
    expect((await upsertLocalJobs(userId, [second])).updated).toBe(1);
    const jobs = await readLocalJobs(userId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.lastSeenAt.toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });
});
