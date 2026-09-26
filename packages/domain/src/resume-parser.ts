import type { ParsedResumeData } from "./index";

const skillCatalog = ["React", "TypeScript", "JavaScript", "Next.js", "Redux", "GraphQL", "REST", "Cypress", "Playwright", "Tailwind CSS", "Material UI", "Node.js", "AWS", "HTML", "CSS", "Jest", "Vitest", "Webpack", "Git", "Accessibility", "PostgreSQL", "Supabase"];
const rolePattern = /engineer|developer|architect|designer|lead|manager|consultant|intern/i;
const dateRangePattern = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}\s*(?:-|–|—|to)\s*(((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(19|20)\d{2}|present|current)/i;

const field = <T>(value: T, confidence: number, evidence: string) => ({ value, source: "resume" as const, confidence, evidence });
const cleanLine = (line: string) => line.replace(/[•●▪◦]/g, "").trim();
const unique = <T>(items: T[]) => [...new Set(items)];
const knownLocations = /^(?:remote|hybrid|on-?site|bangalore|bengaluru|india|usa|u\.s\.a\.?|us|united states|uk|united kingdom|uae|canada|australia|singapore|europe|apac)(?:\s*\((?:remote|hybrid|on-?site)\))?$/i;
const uiLinkLabel = /(?:GitHub|Demo|Live|Portfolio|Website|Repository|View Project)$/i;

function splitEmployerLocation(value: string): { company: string; location: string } {
  const separators: Array<{ pattern: RegExp; flexible: boolean }> = [
    { pattern: /^(.*),\s*([^,]+)$/, flexible: false },
    { pattern: /^(.*?)\s*\|\s*([^|]+)$/, flexible: true },
    { pattern: /^(.*?)\s+[–—]\s+(.+)$/, flexible: true }
  ];
  for (const { pattern, flexible } of separators) {
    const match = value.match(pattern);
    if (!match) continue;
    const company = match[1]?.trim() ?? "";
    const location = match[2]?.trim() ?? "";
    const shortTitleLocation = /^[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,2}(?:\s*\((?:Remote|Hybrid|On-?site)\))?$/.test(location);
    if (company && location && (knownLocations.test(location) || (flexible && shortTitleLocation))) return { company, location };
  }
  return { company: value.trim(), location: "" };
}

function cleanProjectName(value: string): string {
  const separated = value.replace(/(?:\s{2,}|\s+[|•·]\s*|\s+[–—-]\s+)(?:GitHub|Demo|Live|Portfolio|Website|Repository|View Project)\s*$/i, "").trim();
  if (separated !== value.trim()) return separated;
  const glued = value.match(/^(.*[a-z0-9)])(GitHub|Demo|Portfolio|Website|Repository|View Project)$/i);
  return glued && uiLinkLabel.test(glued[2] ?? "") ? (glued[1] ?? value).trim() : value.trim();
}

const cleanDanglingSeparator = (value: string) => value.replace(/\s*[-–—|:]\s*$/, "").trim();
const httpUrls = (values: string[]) => unique(values.filter((value) => /^https?:\/\//i.test(value)).map((value) => value.replace(/[.,]$/, "")));
const urlPathSegments = (value: string) => { try { return new URL(value).pathname.split("/").filter(Boolean); } catch { return []; } };
const normalizedUrl = (value: string) => { try { return decodeURIComponent(new URL(value).href).toLowerCase(); } catch { return value.toLowerCase(); } };

function section(text: string, names: string[], nextNames: string[]): string[] {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const start = lines.findIndex((line) => names.some((name) => line.toLowerCase() === name));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => nextNames.some((name) => line.toLowerCase() === name));
  return end < 0 ? rest : rest.slice(0, end);
}

function parseExperience(text: string): ParsedResumeData["experience"] {
  const lines = section(text, ["experience", "work experience", "professional experience", "employment"], ["projects", "education", "skills", "certifications"]);
  const entries: ParsedResumeData["experience"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const dateMatch = lines[index]?.match(dateRangePattern);
    if (!dateMatch) continue;
    const nearby = lines.slice(Math.max(0, index - 2), index + 1);
    const heading = (lines[index] ?? "").replace(dateMatch[0], "").trim();
    const role = (rolePattern.test(heading) ? heading : undefined) ?? nearby.find((line) => rolePattern.test(line) && !dateRangePattern.test(line));
    const followingLine = lines[index + 1];
    const employerLine = (followingLine && !dateRangePattern.test(followingLine) && !rolePattern.test(followingLine) ? followingLine : undefined)
      ?? [...nearby].reverse().find((line) => line !== role && !dateRangePattern.test(line) && !/experience|employment/i.test(line));
    if (!role || !employerLine) continue;
    const { company, location } = splitEmployerLocation(employerLine);
    const descriptionLines: string[] = [];
    const descriptionStart = followingLine === employerLine ? index + 2 : index + 1;
    for (let cursor = descriptionStart; cursor < lines.length && !dateRangePattern.test(lines[cursor] ?? ""); cursor += 1) {
      const descriptionLine = lines[cursor];
      if (descriptionLine) descriptionLines.push(descriptionLine);
    }
    const endText = dateMatch[3] ?? "";
    const technologies = skillCatalog.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(descriptionLines.join(" ")));
    const value = { company, role, location, startDate: dateMatch[0].split(/-|–|—|to/i)[0]?.trim() ?? "", endDate: /present|current/i.test(endText) ? undefined : endText.trim(), current: /present|current/i.test(endText), summary: descriptionLines.join(" "), achievements: descriptionLines, technologies };
    entries.push(field(value, 0.72, nearby.join(" · ")));
  }
  return entries;
}

function parseProjects(text: string, embeddedUrls: string[]): ParsedResumeData["projects"] {
  const lines = section(text, ["projects", "selected projects", "personal projects"], ["education", "skills", "experience", "certifications"]);
  if (!lines.length) return [];
  const groups: string[][] = [];
  for (const line of lines) {
    if (line.length < 80 && !line.startsWith("-") && !line.endsWith(".")) groups.push([line]);
    else if (groups.length) groups.at(-1)?.push(line);
  }
  return groups.slice(0, 12).map((group) => {
    const name = cleanProjectName(group[0] ?? "");
    const detail = group.slice(1).join(" ");
    const technologies = skillCatalog.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(group.join(" ")));
    const nameTokens = name.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
    const annotationLinks = embeddedUrls.filter((url) => nameTokens.some((token) => normalizedUrl(url).includes(token)));
    const links = httpUrls([...(group.join(" ").match(/https?:\/\/[^\s)]+/g) ?? []), ...annotationLinks]);
    return field({ name, description: detail, technologies, achievements: group.slice(1), links }, 0.62, group.join(" · "));
  }).filter((entry) => entry.value.name.length > 1);
}

function parseEducation(text: string): ParsedResumeData["education"] {
  const lines = section(text, ["education", "academic background"], ["projects", "skills", "experience", "certifications"]);
  const degreePattern = /bachelor|master|b\.?(?:tech|sc|e)|m\.?(?:tech|sc|e)|degree|diploma|phd/i;
  return lines.filter((line) => degreePattern.test(line)).slice(0, 6).map((line, index) => {
    const institution = lines[index + 1] && !degreePattern.test(lines[index + 1] ?? "") ? lines[index + 1] ?? "" : "Review institution";
    const yearMatches = line.match(/(?:19|20)\d{2}/g) ?? [];
    return field({ institution, degree: cleanDanglingSeparator(line.replace(/(?:19|20)\d{2}/g, "")), field: "", startDate: yearMatches[0], endDate: yearMatches[1] }, institution === "Review institution" ? 0.4 : 0.65, line);
  });
}

export function parseResumeText(rawText: string, embeddedLinks: string[] = []): ParsedResumeData {
  const text = rawText.normalize("NFKC");
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
  const urls = httpUrls([...(text.match(/https?:\/\/[^\s)]+/g) ?? []), ...embeddedLinks]);
  const linkedin = urls.find((url) => /linkedin\.com\/in\//i.test(url));
  const github = urls.find((url) => /github\.com\//i.test(url) && urlPathSegments(url).length === 1);
  const name = lines.slice(0, 6).find((line) => /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(line) && line.split(/\s+/).length >= 2 && !rolePattern.test(line));
  const skills = skillCatalog.filter((skill) => new RegExp(`(^|[^A-Za-z0-9])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(text));
  const experience = parseExperience(text);
  const projects = parseProjects(text, urls);
  const current = experience.find((entry) => entry.value.current) ?? experience[0];
  const projectUrls = new Set(projects.flatMap((project) => project.value.links));
  const otherUrl = urls.find((url) => url !== linkedin && url !== github && !projectUrls.has(url) && !/github\.com|linkedin\.com/i.test(url));
  const yearsExperience = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?\s+of\s+experience/i)?.[1];
  const warnings: string[] = [];
  if (!experience.length) warnings.push("Employment history could not be confidently structured and requires review.");
  if (!name) warnings.push("Full name could not be identified confidently.");
  return {
    personal: {
      ...(name ? { fullName: field(name, 0.78, name) } : {}),
      ...(email ? { email: field(email, 0.99, email) } : {}),
      ...(phone ? { phone: field(phone, 0.9, phone) } : {})
    },
    links: {
      ...(linkedin ? { linkedInUrl: field(linkedin, 0.99, linkedin) } : {}),
      ...(github ? { githubUrl: field(github, 0.99, github) } : {}),
      ...(otherUrl ? { portfolioUrl: field(otherUrl, 0.7, otherUrl) } : {})
    },
    career: {
      ...(current ? { currentEmployer: field(current.value.company, current.confidence, current.evidence), currentRole: field(current.value.role, current.confidence, current.evidence) } : {}),
      ...(yearsExperience ? { totalYearsExperience: field(Number(yearsExperience), 0.85, `${yearsExperience} years of experience`) } : {})
    },
    skills: skills.map((skill) => field(skill, 0.94, skill)),
    experience,
    projects,
    education: parseEducation(text),
    warnings
  };
}
