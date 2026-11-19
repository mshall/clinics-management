-- MS-04 staff digests, CR-07 in-app notices, quiet-hour preferences
CREATE TABLE "StaffDigestPreference" (
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorTomorrowList" BOOLEAN NOT NULL DEFAULT true,
    "ownerWeeklyInsights" BOOLEAN NOT NULL DEFAULT true,
    "ownerShiftSummaries" BOOLEAN NOT NULL DEFAULT true,
    "kiorexProgressNudges" BOOLEAN NOT NULL DEFAULT true,
    "optOutAll" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" INTEGER NOT NULL DEFAULT 21,
    "quietHoursEnd" INTEGER NOT NULL DEFAULT 8,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDigestPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "StaffInAppNotice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL DEFAULT '',
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInAppNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigestSendLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffDigestPreference_tenantId_idx" ON "StaffDigestPreference"("tenantId");
CREATE INDEX "StaffInAppNotice_userId_readAt_createdAt_idx" ON "StaffInAppNotice"("userId", "readAt", "createdAt");
CREATE INDEX "StaffInAppNotice_tenantId_createdAt_idx" ON "StaffInAppNotice"("tenantId", "createdAt");
CREATE UNIQUE INDEX "DigestSendLog_userId_kind_periodKey_key" ON "DigestSendLog"("userId", "kind", "periodKey");
CREATE INDEX "DigestSendLog_tenantId_kind_periodKey_idx" ON "DigestSendLog"("tenantId", "kind", "periodKey");

ALTER TABLE "StaffDigestPreference" ADD CONSTRAINT "StaffDigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffInAppNotice" ADD CONSTRAINT "StaffInAppNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigestSendLog" ADD CONSTRAINT "DigestSendLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
