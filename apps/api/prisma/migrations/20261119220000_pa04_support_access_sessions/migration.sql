-- PA-04: owner-approved, time-boxed platform support access sessions
CREATE TYPE "SupportAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED');

CREATE TABLE "SupportAccessSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'PENDING',
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "requestedUnmaskPhi" BOOLEAN NOT NULL DEFAULT false,
    "phiUnmasked" BOOLEAN NOT NULL DEFAULT false,
    "approverUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAccessSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportAccessReadLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientId" TEXT,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAccessReadLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAccessSession_tenantId_status_createdAt_idx" ON "SupportAccessSession"("tenantId", "status", "createdAt");
CREATE INDEX "SupportAccessSession_requesterUserId_status_idx" ON "SupportAccessSession"("requesterUserId", "status");
CREATE INDEX "SupportAccessSession_expiresAt_idx" ON "SupportAccessSession"("expiresAt");
CREATE INDEX "SupportAccessReadLog_sessionId_createdAt_idx" ON "SupportAccessReadLog"("sessionId", "createdAt");
CREATE INDEX "SupportAccessReadLog_patientId_createdAt_idx" ON "SupportAccessReadLog"("patientId", "createdAt");

ALTER TABLE "SupportAccessSession" ADD CONSTRAINT "SupportAccessSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAccessSession" ADD CONSTRAINT "SupportAccessSession_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAccessSession" ADD CONSTRAINT "SupportAccessSession_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAccessReadLog" ADD CONSTRAINT "SupportAccessReadLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SupportAccessSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
