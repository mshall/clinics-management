-- PRSOP01 / PRVER01-04 (KX-05 Rev 2.3 §06, ADR-029). EXPAND phase only: additive, nullable / defaulted, no drops.
-- Contract (backfill complete => app treats NULL as legacy PHYSICIAN) is a later migration after one release.

CREATE TYPE "Profession" AS ENUM ('PHYSICIAN', 'DENTIST', 'PHYSIOTHERAPIST', 'NURSE', 'ASSISTANT');

ALTER TABLE "User" ADD COLUMN "profession" "Profession";
ALTER TABLE "User" ADD COLUMN "supervisorUserId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_supervisorUserId_idx" ON "User"("supervisorUserId");

ALTER TABLE "ClinicianVerification" ADD COLUMN "profession" "Profession";
ALTER TABLE "ClinicianVerification" ADD COLUMN "verifiedProfession" "Profession";
ALTER TABLE "ClinicianVerification" ADD COLUMN "verifiedName" TEXT;
ALTER TABLE "ClinicianVerification" ADD COLUMN "isSolo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClinicianVerification" ADD COLUMN "reverifyReason" TEXT;
ALTER TABLE "ClinicianVerification" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "ClinicianVerification" ADD COLUMN "nextReverifyAt" TIMESTAMP(3);
ALTER TABLE "ClinicianVerification" ADD COLUMN "expiryReminderStage" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ClinicianVerification_status_nextReverifyAt_idx" ON "ClinicianVerification"("status", "nextReverifyAt");

CREATE TABLE "ProfessionalRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationId" TEXT,
    "profession" "Profession" NOT NULL,
    "registerCode" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfessionalRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfessionalRegistration_userId_registerCode_key" ON "ProfessionalRegistration"("userId", "registerCode");
CREATE INDEX "ProfessionalRegistration_tenantId_status_idx" ON "ProfessionalRegistration"("tenantId", "status");
CREATE INDEX "ProfessionalRegistration_status_expiresAt_idx" ON "ProfessionalRegistration"("status", "expiresAt");
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "ProfessionalRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "ProfessionalRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "ProfessionalRegistration_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "ClinicianVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PRSOP01 backfill (idempotent). Physician-role users: DENTIST when their declared / verified specialty is DENTISTRY, else PHYSICIAN.
UPDATE "User" u SET "profession" = 'DENTIST'
WHERE u."profession" IS NULL
  AND (u."role" = 'PHYSICIAN' OR 'PHYSICIAN' = ANY(u."additionalRoles"))
  AND EXISTS (
    SELECT 1 FROM "ClinicianVerification" v
    WHERE v."userId" = u."id" AND (v."specialty" = 'DENTISTRY' OR v."verifiedSpecialty" = 'DENTISTRY')
  );
UPDATE "User" u SET "profession" = 'PHYSICIAN'
WHERE u."profession" IS NULL
  AND (u."role" = 'PHYSICIAN' OR 'PHYSICIAN' = ANY(u."additionalRoles"));
-- Legacy NURSE-role staff (never prescribers, BR49) carry the NURSE profession so scope enforcement is explicit.
UPDATE "User" SET "profession" = 'NURSE'
WHERE "profession" IS NULL AND "role" = 'NURSE' AND NOT ('PHYSICIAN' = ANY("additionalRoles"));
-- Verification snapshots follow the user.
UPDATE "ClinicianVerification" v SET "profession" = u."profession"
FROM "User" u WHERE u."id" = v."userId" AND v."profession" IS NULL AND u."profession" IS NOT NULL;
UPDATE "ClinicianVerification" v SET "verifiedProfession" = v."profession", "verifiedName" = u."displayName", "verifiedAt" = COALESCE(v."reviewedAt", v."updatedAt")
FROM "User" u WHERE u."id" = v."userId" AND v."status" = 'VERIFIED' AND v."verifiedProfession" IS NULL;
