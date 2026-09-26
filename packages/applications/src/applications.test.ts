import { describe, expect, it } from "vitest";
import { LocalTaskQueue, MockApplicationAdapter, assertAutomaticSubmissionAllowed, assertFreeInfrastructure } from "./index";
describe("dry-run application safety", () => {
  it("simulates instead of submitting", async () => {
    const result = await new MockApplicationAdapter().apply({ jobId: "job-1", resumeId: "resume-1", answers: {}, dryRun: true });
    expect(result.status).toBe("SIMULATED");
  });
  it("blocks submission", () => expect(() => assertAutomaticSubmissionAllowed(true)).toThrow(/DRY RUN/));
  it("provides a zero-infrastructure local queue", async () => {
    const queue = new LocalTaskQueue<{ jobId: string }>();
    await queue.enqueue({ id: "one", payload: { jobId: "job-1" }, status: "QUEUED", attempts: 0, availableAt: new Date(0) });
    expect((await queue.takeReady())?.payload.jobId).toBe("job-1");
  });
  it("blocks paid infrastructure in free mode", () => expect(() => assertFreeInfrastructure({ feature: "paid browser farm", requiresPaidService: true }, true)).toThrow(/PAID_SERVICE_REQUIRED/));
});
