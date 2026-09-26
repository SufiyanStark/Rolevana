import { describe, expect, it } from "vitest";
import { parseResumeText } from "./index";

describe("resume normalization", () => {
  it.each([
    ["Argument Driven Inquiry, USA (Remote)", "Argument Driven Inquiry", "USA (Remote)"],
    ["PearlThoughts, Bangalore", "PearlThoughts", "Bangalore"],
    ["Acme | Bangalore", "Acme", "Bangalore"],
    ["Acme — Bangalore", "Acme", "Bangalore"]
  ])("separates a clear employer location in %s", (line, company, location) => {
    const parsed = parseResumeText(`Candidate Name\nExperience\nFrontend EngineerJan 2024 – Present\n${line}\nBuilt products\nEducation`);
    expect(parsed.experience[0]?.value).toMatchObject({ company, location });
  });

  it("does not split a comma-bearing employer when the suffix is not clearly a location", () => {
    const parsed = parseResumeText("Candidate Name\nExperience\nEngineerJan 2024 – Present\nSmith, Johnson & Partners\nBuilt products\nEducation");
    expect(parsed.experience[0]?.value).toMatchObject({ company: "Smith, Johnson & Partners", location: "" });
  });

  it("removes an adjacent project link label without damaging legitimate names", () => {
    const parsed = parseResumeText("Candidate Name\nProjects\nAEVRISSE – Interactive 3D E-Commerce ExperienceGitHub\nA product experience.\nGitHub Actions Dashboard\nEducation");
    expect(parsed.projects.map((project) => project.value.name)).toEqual(["AEVRISSE – Interactive 3D E-Commerce Experience", "GitHub Actions Dashboard"]);
  });

  it("maps embedded personal and project hyperlink annotations without fabricating URLs", () => {
    const projectUrl = "https://github.com/example/Personal-Projects/tree/main/AEVRISSE";
    const parsed = parseResumeText("Candidate Name\nLinkedIn GitHub\nProjects\nAEVRISSE – Interactive ExperienceGitHub\nEducation", [
      "mailto:person@example.com", "https://linkedin.com/in/example", "https://github.com/example", projectUrl
    ]);
    expect(parsed.links.linkedInUrl?.value).toBe("https://linkedin.com/in/example");
    expect(parsed.links.githubUrl?.value).toBe("https://github.com/example");
    expect(parsed.projects[0]?.value.links).toEqual([projectUrl]);
  });

  it.each(["-", "–", "—", "|", ":"])("removes a dangling %s from a degree", (separator) => {
    const parsed = parseResumeText(`Candidate Name\nEducation\nB.E. Electronics and Communication Engineering ${separator}\nExample Institute`);
    expect(parsed.education[0]?.value.degree).toBe("B.E. Electronics and Communication Engineering");
  });
});
