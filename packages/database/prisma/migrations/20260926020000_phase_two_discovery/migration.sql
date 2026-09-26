ALTER TABLE "JobSource" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'COMPANY_CAREER_PAGE',
ADD COLUMN "companyName" TEXT,
ADD COLUMN "boardIdentifier" TEXT,
ADD COLUMN "baseUrl" TEXT,
ADD COLUMN "lastSuccessfulScan" TIMESTAMP(3),
ADD COLUMN "lastFailedScan" TIMESTAMP(3),
ADD COLUMN "lastError" TEXT,
ADD COLUMN "jobCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Job" ADD COLUMN "updatedAt" TIMESTAMP(3),
ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "descriptionHash" TEXT,
ADD COLUMN "frontendClassification" TEXT NOT NULL DEFAULT 'AMBIGUOUS',
ADD COLUMN "classificationReason" TEXT,
ADD COLUMN "freshness" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "locationRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "salaryMin" DECIMAL(14,2),
ADD COLUMN "salaryMax" DECIMAL(14,2),
ADD COLUMN "salaryCurrency" TEXT,
ADD COLUMN "salaryInterval" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "team" TEXT;

ALTER TABLE "JobSourceRun" ADD COLUMN "jobsFetched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "jobsCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "jobsRejectedNonRemote" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "jobsRejectedLocation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "jobsRejectedRole" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ambiguousJobs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "latencyMs" INTEGER;

CREATE TABLE "JobSourceReference" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "provider" TEXT NOT NULL, "sourceRecordId" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL, "applicationUrl" TEXT, "attribution" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobSourceReference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobSourceReference_jobId_provider_sourceRecordId_key" ON "JobSourceReference"("jobId", "provider", "sourceRecordId");
CREATE INDEX "JobSourceReference_provider_sourceRecordId_idx" ON "JobSourceReference"("provider", "sourceRecordId");
ALTER TABLE "JobSourceReference" ADD CONSTRAINT "JobSourceReference_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JobClassificationCache" (
  "id" TEXT NOT NULL, "descriptionHash" TEXT NOT NULL, "result" JSONB NOT NULL, "provider" TEXT NOT NULL, "model" TEXT NOT NULL,
  "freeModelVerified" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobClassificationCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobClassificationCache_descriptionHash_key" ON "JobClassificationCache"("descriptionHash");

CREATE TABLE "AIProviderHealthCheck" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "model" TEXT, "status" TEXT NOT NULL, "authenticated" BOOLEAN NOT NULL DEFAULT false,
  "freeVerified" BOOLEAN NOT NULL DEFAULT false, "inference" TEXT NOT NULL DEFAULT 'NOT_RUN', "latencyMs" INTEGER, "safeMessage" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AIProviderHealthCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AIProviderHealthCheck_provider_checkedAt_idx" ON "AIProviderHealthCheck"("provider", "checkedAt");
