export const jobSourceProviders = ["REMOTE_OK", "ASHBY", "GREENHOUSE", "LEVER", "COMPANY_CAREER_PAGE", "MOCK"] as const;
export type JobSourceProvider = typeof jobSourceProviders[number];
export type WorkplaceType = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type RemoteRegion = "REMOTE_WORLDWIDE" | "REMOTE_INDIA" | "REMOTE_APAC" | "REMOTE_US_ONLY" | "REMOTE_CANADA_ONLY" | "REMOTE_EU_ONLY" | "REMOTE_UK_ONLY" | "REMOTE_LATAM" | "UNKNOWN";
export type FrontendClassification = "FRONTEND" | "FRONTEND_HEAVY" | "NOT_FRONTEND" | "AMBIGUOUS";
export type DiscoveryStatus = "DISCOVERED" | "QUALIFIED_BY_FILTER" | "NEEDS_CLASSIFICATION" | "WAITING_FOR_FREE_AI" | "REJECTED_NOT_REMOTE" | "REJECTED_LOCATION" | "REJECTED_ROLE" | "REJECTED_TARGET_ROLE" | "REJECTED_EXPERIENCE" | "DUPLICATE";
export type FreshnessBucket = "JUST_POSTED" | "VERY_FRESH" | "FRESH" | "RECENT" | "OLDER" | "UNKNOWN";
export type Seniority = "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "STAFF" | "PRINCIPAL" | "MANAGER" | "UNKNOWN";
export type ExperienceCompatibility = "COMPATIBLE" | "SLIGHTLY_ABOVE" | "MAJOR_MISMATCH" | "UNKNOWN";

export type JobSourceReference = { provider: JobSourceProvider; sourceRecordId: string; originalUrl: string; applicationUrl?: string; attribution?: string };
export type NormalizedJob = {
  id?: string;
  externalJobId: string;
  source: JobSourceProvider;
  sourceRecordId?: string;
  companyName: string;
  companyWebsite?: string;
  title: string;
  description: string;
  requirements: string[];
  preferredQualifications: string[];
  employmentType?: string;
  workplaceType: WorkplaceType;
  remoteRegions: RemoteRegion[];
  locationRestrictions: string[];
  locations: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryInterval?: string;
  department?: string;
  team?: string;
  postedAt?: Date;
  updatedAt?: Date;
  discoveredAt: Date;
  lastSeenAt: Date;
  jobUrl: string;
  applicationUrl: string;
  applicationEmail?: string;
  canonicalUrl: string;
  sourceMetadata: Record<string, unknown>;
  descriptionHash: string;
  dedupeFingerprint: string;
  status: DiscoveryStatus;
  frontendClassification: FrontendClassification;
  roleCategory: string;
  seniority: Seniority;
  minimumYearsExperience?: number;
  maximumYearsExperience?: number;
  classificationReason: string;
  freshness: FreshnessBucket;
  sourceReferences: JobSourceReference[];
};

export type JobTargetPreferences = { selectedRoleTitle: string; roleCategory: string; relatedTitles: string[]; includeRelatedTitles: boolean; candidateYearsExperience: number; experienceToleranceYears: number };

export type JobSourceRegistryRecord = {
  id: string;
  provider: JobSourceProvider;
  companyName: string;
  boardIdentifier: string;
  baseUrl?: string;
  enabled: boolean;
  lastSuccessfulScan?: string;
  lastFailedScan?: string;
  lastError?: string;
  jobCount: number;
  createdAt: string;
  updatedAt: string;
};

export interface JobSourceAdapter<TRaw = unknown> {
  readonly id: string;
  readonly provider: JobSourceProvider;
  readonly companyName: string;
  searchJobs(since?: Date): Promise<TRaw[]>;
  getJobDetails(externalJobId: string): Promise<TRaw>;
  normalizeJob(raw: TRaw, discoveredAt?: Date): NormalizedJob;
  getApplicationUrl(raw: TRaw): string;
}

export type SourceRunSummary = {
  sourceId: string;
  provider: JobSourceProvider;
  startedAt: string;
  finishedAt: string;
  jobsFetched: number;
  jobsCreated: number;
  jobsUpdated: number;
  duplicatesFound: number;
  jobsRejectedNonRemote: number;
  jobsRejectedLocation: number;
  jobsRejectedRole: number;
  ambiguousJobs: number;
  latencyMs: number;
  error?: string;
};
