-- ADR-039 telehealth: sessions, signaling messages, per-doctor settings (all additive).
CREATE TYPE "TelehealthSessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'ACTIVE', 'ENDED', 'CANCELLED', 'MISSED');
CREATE TYPE "TelehealthMode" AS ENUM ('VIDEO', 'AUDIO');
CREATE TYPE "TelehealthRole" AS ENUM ('CLINICIAN', 'PATIENT');
CREATE TYPE "TelehealthSignalType" AS ENUM ('OFFER', 'ANSWER', 'ICE_CANDIDATE', 'BYE', 'RENEGOTIATE');

ALTER TABLE "Tenant" ADD COLUMN "telehealthNoShowMinutes" INTEGER NOT NULL DEFAULT 15;

CREATE TABLE "TelehealthSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianUserId" TEXT NOT NULL,
    "status" "TelehealthSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "mode" "TelehealthMode" NOT NULL DEFAULT 'VIDEO',
    "linkVersion" INTEGER NOT NULL DEFAULT 1,
    "clinicianJoinedAt" TIMESTAMP(3),
    "patientJoinedAt" TIMESTAMP(3),
    "clinicianLastSeenAt" TIMESTAMP(3),
    "patientLastSeenAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "bothActiveSince" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "missedAt" TIMESTAMP(3),
    "needsStaffReview" BOOLEAN NOT NULL DEFAULT false,
    "reminderState" JSONB,
    "signalSeq" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelehealthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelehealthSignal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromRole" "TelehealthRole" NOT NULL,
    "type" "TelehealthSignalType" NOT NULL,
    "payload" JSONB NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelehealthSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicianTelehealthSetting" (
    "tenantId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "offersTelehealth" BOOLEAN NOT NULL DEFAULT false,
    "windowsJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicianTelehealthSetting_pkey" PRIMARY KEY ("clinicianId")
);

CREATE UNIQUE INDEX "TelehealthSession_appointmentId_key" ON "TelehealthSession"("appointmentId");
CREATE INDEX "TelehealthSession_tenantId_status_idx" ON "TelehealthSession"("tenantId", "status");
CREATE INDEX "TelehealthSession_tenantId_clinicianUserId_idx" ON "TelehealthSession"("tenantId", "clinicianUserId");
CREATE INDEX "TelehealthSession_status_updatedAt_idx" ON "TelehealthSession"("status", "updatedAt");
CREATE UNIQUE INDEX "TelehealthSignal_sessionId_seq_key" ON "TelehealthSignal"("sessionId", "seq");
CREATE INDEX "TelehealthSignal_createdAt_idx" ON "TelehealthSignal"("createdAt");
CREATE INDEX "ClinicianTelehealthSetting_tenantId_offersTelehealth_idx" ON "ClinicianTelehealthSetting"("tenantId", "offersTelehealth");

ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelehealthSession" ADD CONSTRAINT "TelehealthSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelehealthSignal" ADD CONSTRAINT "TelehealthSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TelehealthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianTelehealthSetting" ADD CONSTRAINT "ClinicianTelehealthSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClinicianTelehealthSetting" ADD CONSTRAINT "ClinicianTelehealthSetting_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Encounter auto-creation (exactly one Telehealth encounter per appointment, race-safe). Created only when existing data allows it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Encounter" WHERE "appointmentId" IS NOT NULL AND "visitType" = 'Telehealth'
    GROUP BY "appointmentId" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "Encounter_appointmentId_telehealth_key" ON "Encounter"("appointmentId")
      WHERE "appointmentId" IS NOT NULL AND "visitType" = 'Telehealth';
  END IF;
END $$;
