-- CL-03: pharmacy verification tokens for signed prescriptions (QR on print / WhatsApp PDF)
CREATE TABLE "PrescriptionVerificationToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrescriptionVerificationToken_tokenHash_key" ON "PrescriptionVerificationToken"("tokenHash");
CREATE INDEX "PrescriptionVerificationToken_tenantId_idx" ON "PrescriptionVerificationToken"("tenantId");
CREATE INDEX "PrescriptionVerificationToken_encounterId_idx" ON "PrescriptionVerificationToken"("encounterId");

ALTER TABLE "PrescriptionVerificationToken" ADD CONSTRAINT "PrescriptionVerificationToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionVerificationToken" ADD CONSTRAINT "PrescriptionVerificationToken_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
