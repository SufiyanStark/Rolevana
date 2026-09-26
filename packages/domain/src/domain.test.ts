import { describe, expect, it } from "vitest";
import { candidateProfileSchema, masterResumeSchema } from "./index";

describe("candidate profile", () => {
  it("rejects profiles that are not remote-only", () => {
    const result = candidateProfileSchema.safeParse({ remoteOnly: false });
    expect(result.success).toBe(false);
  });
});

describe("master resume", () => {
  it("rejects executable uploads", () => {
    const result = masterResumeSchema.safeParse({
      id: crypto.randomUUID(), originalFileName: "resume.exe", mimeType: "application/octet-stream",
      sizeBytes: 10, storageKey: "x", uploadedAt: new Date()
    });
    expect(result.success).toBe(false);
  });
});

