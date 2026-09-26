import { z } from "zod";

export const employmentTypes = ["FULL_TIME", "CONTRACT", "PART_TIME", "INTERNSHIP"] as const;
export const remoteRegions = ["India", "Worldwide", "APAC", "Middle East", "UAE", "Saudi Arabia", "Qatar", "Bahrain", "Europe", "UK", "US"] as const;

export const candidateSkillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  years: z.number().min(0).max(60).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).optional()
});

export const experienceSchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  location: z.string().default(""),
  startDate: z.string().min(4),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  summary: z.string().max(4000).default(""),
  achievements: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([])
});

export const projectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().max(4000).default(""),
  technologies: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  links: z.array(z.string().url()).default([])
});

export const educationSchema = z.object({
  institution: z.string().trim().min(1),
  degree: z.string().default(""),
  field: z.string().default(""),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

export const candidateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  preferredName: z.string().trim().max(80).default(""),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(30),
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  linkedInUrl: z.string().url().or(z.literal("")),
  githubUrl: z.string().url().or(z.literal("")),
  portfolioUrl: z.string().url().or(z.literal("")),
  websiteUrl: z.string().url().or(z.literal("")),
  currentEmployer: z.string().max(120).default(""),
  currentRole: z.string().max(120).default(""),
  totalYearsExperience: z.number().min(0).max(60),
  noticePeriod: z.string().max(120).default(""),
  currentCompensation: z.string().max(120).default(""),
  expectedCompensation: z.string().max(120).default(""),
  preferredSalaryRange: z.string().max(120).default(""),
  currency: z.string().length(3).default("INR"),
  employmentTypes: z.array(z.enum(employmentTypes)).min(1),
  remoteOnly: z.literal(true),
  allowedRegions: z.array(z.string().min(1)).min(1),
  workAuthorization: z.string().max(2000).default(""),
  sponsorshipRequired: z.enum(["YES", "NO", "UNKNOWN"]),
  relocationWillingness: z.enum(["YES", "NO", "CASE_BY_CASE"]),
  timezoneFlexibility: z.string().max(1000).default(""),
  skills: z.array(candidateSkillSchema),
  experience: z.array(experienceSchema),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([])
});

export type CandidateProfileInput = z.input<typeof candidateProfileSchema>;
export type CandidateProfile = z.output<typeof candidateProfileSchema>;
export const RESUME_PARSER_VERSION = 3;

export const createEmptyCandidateProfile = (): CandidateProfile => ({
  fullName: "", preferredName: "", email: "", phone: "", city: "", country: "", timezone: "Asia/Kolkata",
  linkedInUrl: "", githubUrl: "", portfolioUrl: "", websiteUrl: "", currentEmployer: "", currentRole: "",
  totalYearsExperience: 0, noticePeriod: "", currentCompensation: "", expectedCompensation: "",
  preferredSalaryRange: "", currency: "INR", employmentTypes: ["FULL_TIME"], remoteOnly: true,
  allowedRegions: ["India", "Worldwide", "APAC"], workAuthorization: "", sponsorshipRequired: "UNKNOWN",
  relocationWillingness: "CASE_BY_CASE", timezoneFlexibility: "", skills: [], experience: [], projects: [], education: []
});

export const resumeParsingStatuses = ["UPLOADED", "EXTRACTING_TEXT", "PARSING", "WAITING_FOR_FREE_AI", "PARSED", "REVIEW_REQUIRED", "VERIFIED", "FAILED"] as const;
export type ResumeParsingStatus = typeof resumeParsingStatuses[number];
export type ExtractedField<T> = { value: T; source: "resume"; confidence: number; evidence: string };
export type ParsedResumeData = {
  personal: Partial<Record<"fullName" | "email" | "phone" | "city" | "country", ExtractedField<string>>>;
  links: Partial<Record<"linkedInUrl" | "githubUrl" | "portfolioUrl" | "websiteUrl", ExtractedField<string>>>;
  career: Partial<Record<"currentEmployer" | "currentRole" | "totalYearsExperience", ExtractedField<string | number>>>;
  skills: Array<ExtractedField<string>>;
  experience: Array<ExtractedField<z.infer<typeof experienceSchema>>>;
  projects: Array<ExtractedField<z.infer<typeof projectSchema>>>;
  education: Array<ExtractedField<z.infer<typeof educationSchema>>>;
  warnings: string[];
};

export const masterResumeSchema = z.object({
  id: z.string().uuid(),
  originalFileName: z.string().min(1),
  mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  storageKey: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedAt: z.coerce.date(),
  rawText: z.string(),
  parserVersion: z.number().int().positive().optional(),
  parsedData: z.custom<ParsedResumeData>(),
  parsingStatus: z.enum(resumeParsingStatuses),
  verificationStatus: z.enum(["UNVERIFIED", "REVIEW_REQUIRED", "VERIFIED"])
});

export type MasterResume = z.infer<typeof masterResumeSchema>;
export { parseResumeText } from "./resume-parser";
export { mergeResumeIntoCandidateProfile, type ProfileMergeConflict, type ProfileMergeResult, type ProfileMergeSummary } from "./resume-merge";
export { selectResumeStrategy, validateTailoredResumeClaims, type ResumeStrategy, type TraceableResumeClaim } from "./resume-strategy";
