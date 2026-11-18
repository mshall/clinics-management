-- ON-03: Clinician verification for Kiorex marketplace listing (PA-03)

CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

CREATE TABLE "ClinicianVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "syndicateNumber" TEXT,
    "specialty" "ClinicalSpecialty",
    "titleEn" TEXT,
    "titleAr" TEXT,
    "nationalIdEnc" TEXT,
    "documentKeys" JSONB NOT NULL DEFAULT '[]',
    "status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "rejectReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "verifiedSpecialty" "ClinicalSpecialty",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicianVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicianVerification_userId_key" ON "ClinicianVerification"("userId");
CREATE INDEX "ClinicianVerification_tenantId_status_idx" ON "ClinicianVerification"("tenantId", "status");
CREATE INDEX "ClinicianVerification_status_idx" ON "ClinicianVerification"("status");

ALTER TABLE "ClinicianVerification" ADD CONSTRAINT "ClinicianVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianVerification" ADD CONSTRAINT "ClinicianVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianVerification" ADD CONSTRAINT "ClinicianVerification_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;