import { inferRoleCategory } from "@rolevana/domain";
import type { ExperienceCompatibility, FreshnessBucket, FrontendClassification, NormalizedJob, RemoteRegion, Seniority, WorkplaceType } from "./types";

const decodeEntities = (value: string) => value
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));

export function sanitizeJobHtml(value: string): string {
  return decodeEntities(value)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function stableTextHash(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) { hash ^= normalized.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeWorkplaceType(...values: Array<string | undefined>): WorkplaceType {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/\b(hybrid|remote\s*[\/-]\s*office|office\s*[\/-]\s*remote)\b/.test(text)) return "HYBRID";
  if (/\b(on[ -]?site|in[ -]?person|office[ -]?based)\b/.test(text) && !/\bremote\b/.test(text)) return "ONSITE";
  if (/\b(remote|work from home|distributed|anywhere)\b/.test(text)) return "REMOTE";
  return "UNKNOWN";
}

export function normalizeRemoteRegions(...values: Array<string | undefined>): RemoteRegion[] {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  const regions: RemoteRegion[] = [];
  if (/worldwide|anywhere|global|all countries/.test(text)) regions.push("REMOTE_WORLDWIDE");
  if (/\bindia\b/.test(text)) regions.push("REMOTE_INDIA");
  if (/\bapac\b|asia[ -]?pacific|anywhere in asia|\basia\b/.test(text)) regions.push("REMOTE_APAC");
  if (/\b(us|u\.s\.|usa|united states)\b(?:\s*only)?/.test(text)) regions.push("REMOTE_US_ONLY");
  if (/\bcanada\b(?:\s*only)?/.test(text)) regions.push("REMOTE_CANADA_ONLY");
  if (/\b(eu|europe|european union)\b(?:\s*only)?/.test(text)) regions.push("REMOTE_EU_ONLY");
  if (/\b(uk|united kingdom)\b(?:\s*only)?/.test(text)) regions.push("REMOTE_UK_ONLY");
  if (/\blatam\b|latin america/.test(text)) regions.push("REMOTE_LATAM");
  return regions.length ? [...new Set(regions)] : ["UNKNOWN"];
}

export function classifyFrontendRole(title: string, description: string): { classification: FrontendClassification; reason: string } {
  const normalizedTitle = title.toLowerCase().replace(/[_/]/g, " ");
  const text = `${normalizedTitle} ${description.toLowerCase()}`;
  const explicitFrontend = /front[ -]?end|react (?:engineer|developer)|next\.?(?:js)? (?:engineer|developer)|ui (?:engineer|developer)|web frontend|software engineer\s*[-–—]\s*frontend/.test(normalizedTitle);
  const negativePrimary = /\b(?:data engineer|machine learning engineer|devops|site reliability|\bsre\b|android|ios|flutter|salesforce|wordpress|embedded|backend)\b/.test(normalizedTitle);
  if (explicitFrontend && !negativePrimary) return { classification: "FRONTEND", reason: "The title explicitly identifies frontend work." };
  if (negativePrimary && !/front[ -]?end|react|typescript/.test(normalizedTitle)) return { classification: "NOT_FRONTEND", reason: "The title identifies a non-frontend primary discipline." };
  const ambiguousTitle = /\b(product engineer|software engineer|full[ -]?stack|web engineer)\b/.test(normalizedTitle);
  const positiveSignals = (text.match(/react|typescript|javascript|next\.js|front[ -]?end|ui engineering|redux|graphql|tailwind|component architecture|browser performance|accessibility/g) ?? []).length;
  const backendSignals = (text.match(/java backend|\.net backend|php|spring boot|microservices|kubernetes|terraform/g) ?? []).length;
  if (ambiguousTitle) {
    if (positiveSignals >= 4 && positiveSignals > backendSignals * 2) return { classification: "FRONTEND_HEAVY", reason: "An ambiguous title has strong frontend-heavy description signals." };
    return { classification: "AMBIGUOUS", reason: "The title is broad and deterministic signals are inconclusive." };
  }
  if (positiveSignals >= 3 && !negativePrimary) return { classification: "FRONTEND_HEAVY", reason: "The description contains multiple frontend engineering signals." };
  return { classification: "NOT_FRONTEND", reason: "No strong frontend focus was found." };
}

export function normalizeSeniority(title: string, description = ""): Seniority {
  const text = `${title} ${description.slice(0, 500)}`.toLowerCase();
  if (/\b(intern|internship|graduate trainee)\b/.test(text)) return "INTERN";
  if (/\b(junior|jr\.?|entry[ -]?level|associate)\b/.test(text)) return "JUNIOR";
  if (/\b(principal)\b/.test(text)) return "PRINCIPAL";
  if (/\b(staff)\b/.test(text)) return "STAFF";
  if (/\b(lead|tech lead|team lead)\b/.test(text)) return "LEAD";
  if (/\b(manager|head of|director)\b/.test(title.toLowerCase())) return "MANAGER";
  if (/\b(senior|sr\.?)\b/.test(text)) return "SENIOR";
  if (/\b(mid|mid[ -]?level|intermediate)\b/.test(text)) return "MID";
  return "UNKNOWN";
}

export function extractExperienceRequirement(title: string, description: string): { minimumYearsExperience?: number; maximumYearsExperience?: number; seniority: Seniority } {
  const text = `${title} ${description}`;
  const range = text.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:\+\s*)?(?:years?|yrs?)\b/i);
  if (range) return { minimumYearsExperience: Number(range[1]), maximumYearsExperience: Number(range[2]), seniority: normalizeSeniority(title, description) };
  const matches = [...text.matchAll(/\b(?:minimum\s+of\s+|at\s+least\s+)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:relevant\s+)?experience\b/gi)].map((match) => Number(match[1])).filter((value) => value <= 30);
  return { ...(matches.length ? { minimumYearsExperience: Math.min(...matches) } : {}), seniority: normalizeSeniority(title, description) };
}

export function experienceCompatibility(candidateYears: number, minimumYears: number | undefined, toleranceYears = 1): ExperienceCompatibility {
  if (minimumYears === undefined) return "UNKNOWN";
  if (minimumYears <= candidateYears + toleranceYears) return "COMPATIBLE";
  if (minimumYears <= candidateYears + toleranceYears + 2) return "SLIGHTLY_ABOVE";
  return "MAJOR_MISMATCH";
}

export function roleMatchesTarget(title: string, roleCategory: string, targetTitle: string, targetCategory: string, relatedTitles: string[], includeRelatedTitles: boolean): boolean | null {
  if (!targetTitle) return null;
  if (roleCategory === targetCategory && roleCategory !== "OTHER") return true;
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
  const candidates = [targetTitle, ...(includeRelatedTitles ? relatedTitles : [])].map((value) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim());
  if (candidates.some((value) => value && (normalizedTitle.includes(value) || value.includes(normalizedTitle)))) return true;
  if (roleCategory === "OTHER" && /\b(software engineer|product engineer|web engineer|full[ -]?stack engineer|technical engineer)\b/i.test(title)) return null;
  return false;
}

export const classifyRoleCategory = (title: string) => inferRoleCategory(title);

export function isRegionEligible(jobRegions: RemoteRegion[], allowedRegions: string[]): boolean | null {
  if (jobRegions.includes("UNKNOWN")) return null;
  if (jobRegions.includes("REMOTE_WORLDWIDE")) return true;
  const allowed = new Set(allowedRegions.map((value) => value.toLowerCase()));
  if (jobRegions.includes("REMOTE_INDIA") && allowed.has("india")) return true;
  if (jobRegions.includes("REMOTE_APAC") && (allowed.has("apac") || allowed.has("india"))) return true;
  if (jobRegions.includes("REMOTE_US_ONLY") && (allowed.has("us") || allowed.has("united states"))) return true;
  if (jobRegions.includes("REMOTE_CANADA_ONLY") && allowed.has("canada")) return true;
  if (jobRegions.includes("REMOTE_EU_ONLY") && (allowed.has("eu") || allowed.has("europe"))) return true;
  if (jobRegions.includes("REMOTE_UK_ONLY") && (allowed.has("uk") || allowed.has("united kingdom"))) return true;
  if (jobRegions.includes("REMOTE_LATAM") && allowed.has("latam")) return true;
  return false;
}

export function freshnessBucket(postedAt: Date | undefined, now = new Date()): FreshnessBucket {
  if (!postedAt || Number.isNaN(postedAt.getTime())) return "UNKNOWN";
  const hours = (now.getTime() - postedAt.getTime()) / 3_600_000;
  if (hours < 1) return "JUST_POSTED";
  if (hours < 6) return "VERY_FRESH";
  if (hours < 24) return "FRESH";
  if (hours < 72) return "RECENT";
  return "OLDER";
}

export function dedupeFingerprint(job: Pick<NormalizedJob, "companyName" | "title" | "locations" | "descriptionHash">): string {
  const identity = `${job.companyName}|${job.title}|${job.locations.slice().sort().join(",")}|${job.descriptionHash}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
  return stableTextHash(identity);
}
