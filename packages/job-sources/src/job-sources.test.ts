import { describe, expect, it } from "vitest";
import { MockJobSourceAdapter, RemoteOKAdapter } from "./index";
describe("mock job source", () => {
  it("returns normalized jobs since the requested scan", async () => {
    const jobs = await new MockJobSourceAdapter().searchJobs(new Date("2026-09-25T16:00:00Z"));
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.workplaceType === "REMOTE")).toBe(true);
  });
  it("decodes safe HTML entities in normalized job titles without rendering HTML",()=>{
    const job=new RemoteOKAdapter().normalizeJob({id:"entity-test",company:"Example &amp; Co",position:"Senior Java &amp; React &lt;Developer&gt; &quot;Web&quot; &#39;UI&#39; &apos;DX&apos;",description:"Remote worldwide role",location:"Worldwide",url:"https://remoteok.com/remote-jobs/entity-test"},new Date("2026-09-30T00:00:00Z"));
    expect(job.title).toBe(`Senior Java & React <Developer> "Web" 'UI' 'DX'`);
    expect(job.companyName).toBe("Example & Co");
  });
});

