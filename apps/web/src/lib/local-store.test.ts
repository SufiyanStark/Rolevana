import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyCandidateProfile, mergeResumeIntoCandidateProfile } from "@rolevana/domain";
import { preserveLocalResume, readLocalProfile, readLocalResume, saveLocalProfile, updateLocalResume } from "./local-store";

describe.sequential("development local store", () => {
  let directory = "";
  const userId = "local-development-user";

  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "rolevana-store-")); process.env.ROLEVANA_LOCAL_DATA_DIR = directory; });
  afterEach(async () => { delete process.env.ROLEVANA_LOCAL_DATA_DIR; await rm(directory, { recursive: true, force: true }); });

  it("round-trips a saved profile from persistent JSON", async () => {
    const expected = { ...createEmptyCandidateProfile(), fullName: "Sufiyan Ahmed", email: "s@example.com", phone: "+919999999999", city: "Pune", country: "India", skills: [{ name: "React" }] };
    await saveLocalProfile(userId, expected);
    expect(await readLocalProfile(userId)).toEqual(expected);
    const onDisk = JSON.parse(await readFile(path.join(directory, userId, "profile.json"), "utf8"));
    expect(onDisk.fullName).toBe("Sufiyan Ahmed");
  });

  it("survives a simulated server reload because reads use the filesystem", async () => {
    await saveLocalProfile(userId, { ...createEmptyCandidateProfile(), fullName: "Persistent User" });
    expect((await readLocalProfile(userId))?.fullName).toBe("Persistent User");
  });

  it("reuses the SHA-256 parse cache while allowing merge to run again", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 test resume");
    const firstFile = new File([bytes], "resume.pdf", { type: "application/pdf" });
    const first = await preserveLocalResume(userId, firstFile);
    const parsedData = { personal: { fullName: { value: "Cached Person", confidence: 0.9, source: "resume" as const, evidence: "test" } }, links: {}, career: {}, skills: [], experience: [], projects: [], education: [], warnings: [] };
    await updateLocalResume(userId, first.resume, { parsedData, rawText: "Cached Person", parsingStatus: "PARSED", verificationStatus: "REVIEW_REQUIRED" });
    expect((await readLocalResume(userId))?.rawText).toBe("Cached Person");
    const second = await preserveLocalResume(userId, new File([bytes], "resume.pdf", { type: "application/pdf" }));
    expect(second.cached).toBe(true);
    expect(second.resume.parsedData.personal.fullName?.value).toBe("Cached Person");
    const merged = mergeResumeIntoCandidateProfile({ ...createEmptyCandidateProfile(), preferredName: "Manual" }, second.resume.parsedData);
    expect(merged.profile).toMatchObject({ fullName: "Cached Person", preferredName: "Manual" });
  });
});
