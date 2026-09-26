-- CreateEnum
CREATE TYPE "ResumeParseStatus" AS ENUM ('UPLOADED', 'EXTRACTING_TEXT', 'PARSING', 'WAITING_FOR_FREE_AI', 'PARSED', 'REVIEW_REQUIRED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResumeVerificationStatus" AS ENUM ('UNVERIFIED', 'REVIEW_REQUIRED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ResumeStrategy" AS ENUM ('MASTER_RESUME', 'TAILORED_RESUME', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DISCOVERED', 'FILTERING', 'REJECTED_NOT_REMOTE', 'REJECTED_LOCATION', 'REJECTED_ROLE', 'ANALYZING', 'BELOW_THRESHOLD', 'QUALIFIED', 'RESUME_GENERATING', 'READY_TO_APPLY', 'APPLYING', 'APPLIED', 'APPLICATION_FAILED', 'EMAIL_SENT', 'NEEDS_REVIEW', 'BLOCKED_CAPTCHA', 'BLOCKED_ASSESSMENT', 'DUPLICATE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationMethod" AS ENUM ('BROWSER', 'EMAIL', 'MANUAL', 'MOCK');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('QUEUED', 'APPLYING', 'APPLIED', 'EMAIL_SENT', 'FAILED', 'NEEDS_REVIEW', 'BLOCKED', 'WITHDRAWN', 'SIMULATED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'RESOLVED', 'SKIPPED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AutopilotStatus" AS ENUM ('OFF', 'RUNNING', 'PAUSED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "preferredName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "linkedInUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "websiteUrl" TEXT,
    "currentEmployer" TEXT,
    "currentRole" TEXT,
    "totalYearsExperience" DECIMAL(4,1) NOT NULL,
    "noticePeriod" TEXT,
    "currentCompensation" TEXT,
    "expectedCompensation" TEXT,
    "preferredSalaryRange" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "remoteOnly" BOOLEAN NOT NULL DEFAULT true,
    "workAuthorization" TEXT,
    "sponsorshipRequired" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "relocationWillingness" TEXT NOT NULL DEFAULT 'CASE_BY_CASE',
    "timezoneFlexibility" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "years" DECIMAL(4,1),
    "level" TEXT,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "current" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "achievements" TEXT[],
    "technologies" TEXT[],

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProject" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "technologies" TEXT[],
    "achievements" TEXT[],
    "links" TEXT[],

    CONSTRAINT "CandidateProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEducation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "field" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidatePreference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "employmentTypes" TEXT[],
    "allowedRegions" TEXT[],
    "targetTitles" TEXT[],
    "excludedTitles" TEXT[],

    CONSTRAINT "CandidatePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterResume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rawText" TEXT,
    "parsedData" JSONB,
    "parseStatus" "ResumeParseStatus" NOT NULL DEFAULT 'UPLOADED',
    "verificationStatus" "ResumeVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MasterResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workplaceType" TEXT NOT NULL,
    "remoteRegions" TEXT[],
    "locations" TEXT[],
    "postedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationUrl" TEXT,
    "jobUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DISCOVERED',
    "sourceMetadata" JSONB,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoredResume" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "structuredData" JSONB NOT NULL,
    "generatedPdfStorageKey" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "pdfExpiresAt" TIMESTAMP(3),
    "provider" TEXT,
    "model" TEXT,
    "validationResult" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TailoredResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysisCache" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "freeModelVerified" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAnalysisCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "strengths" TEXT[],
    "concerns" TEXT[],
    "eligibilityStatus" TEXT NOT NULL,
    "recommendationReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "method" "ApplicationMethod" NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "resumeStrategy" "ResumeStrategy" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "masterResumeId" TEXT,
    "tailoredResumeId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAttempt" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" TEXT NOT NULL,
    "errorCode" TEXT,
    "safeErrorMessage" TEXT,

    CONSTRAINT "ApplicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewQueueItem" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "question" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autopilotStatus" "AutopilotStatus" NOT NULL DEFAULT 'OFF',
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "dailyApplicationTarget" INTEGER NOT NULL DEFAULT 100,
    "minimumMatchScore" INTEGER NOT NULL DEFAULT 65,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "freeAiOnly" BOOLEAN NOT NULL DEFAULT true,
    "freeInfraMode" BOOLEAN NOT NULL DEFAULT true,
    "maxAiCostMicros" INTEGER NOT NULL DEFAULT 0,
    "aiJobAnalysisBatchSize" INTEGER NOT NULL DEFAULT 10,
    "tailoredResumeRetentionDays" INTEGER NOT NULL DEFAULT 60,
    "aiProvider" TEXT NOT NULL DEFAULT 'mock',
    "aiModel" TEXT NOT NULL DEFAULT 'deterministic-phase-1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "JobSourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "safeErrorMessage" TEXT,

    CONSTRAINT "WorkerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "rateLimitErrors" INTEGER NOT NULL DEFAULT 0,
    "quotaErrors" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
    "actualCostMicros" INTEGER NOT NULL DEFAULT 0,
    "freeModelVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationSource" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_profileId_name_key" ON "CandidateSkill"("profileId", "name");

-- CreateIndex
CREATE INDEX "CandidateExperience_profileId_startDate_idx" ON "CandidateExperience"("profileId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "CandidatePreference_profileId_key" ON "CandidatePreference"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterResume_storageKey_key" ON "MasterResume"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MasterResume_checksum_key" ON "MasterResume"("checksum");

-- CreateIndex
CREATE INDEX "MasterResume_userId_isActive_idx" ON "MasterResume"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_name_key" ON "JobSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalUrl_key" ON "Job"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "Job_status_postedAt_idx" ON "Job"("status", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourceId_externalJobId_key" ON "Job"("sourceId", "externalJobId");

-- CreateIndex
CREATE INDEX "TailoredResume_pdfExpiresAt_idx" ON "TailoredResume"("pdfExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TailoredResume_jobId_userId_version_key" ON "TailoredResume"("jobId", "userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysisCache_operation_contentHash_key" ON "AIAnalysisCache"("operation", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_userId_key" ON "JobMatch"("jobId", "userId");

-- CreateIndex
CREATE INDEX "Application_userId_status_createdAt_idx" ON "Application"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAttempt_applicationId_attemptNumber_key" ON "ApplicationAttempt"("applicationId", "attemptNumber");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewQueueItem_status_createdAt_idx" ON "ReviewQueueItem"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_userId_key" ON "Setting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConnection_userId_provider_key" ON "OAuthConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "JobSourceRun_sourceId_startedAt_idx" ON "JobSourceRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkerRun_type_startedAt_idx" ON "WorkerRun"("type", "startedAt");

-- CreateIndex
CREATE INDEX "AIUsage_userId_createdAt_idx" ON "AIUsage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProject" ADD CONSTRAINT "CandidateProject_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePreference" ADD CONSTRAINT "CandidatePreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterResume" ADD CONSTRAINT "MasterResume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TailoredResume" ADD CONSTRAINT "TailoredResume_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "MasterResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_tailoredResumeId_fkey" FOREIGN KEY ("tailoredResumeId") REFERENCES "TailoredResume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttempt" ADD CONSTRAINT "ApplicationAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewQueueItem" ADD CONSTRAINT "ReviewQueueItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceRun" ADD CONSTRAINT "JobSourceRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
