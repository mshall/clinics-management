-- KX-11: consent-based record sharing with the Kiorex patient app
CREATE TYPE "RecordShareScope" AS ENUM ('VISIT_SUMMARY', 'PRESCRIPTIONS', 'LAB_RESULTS', 'SHARE_WITH_OTHER_CLINICS');

CREATE TABLE "PatientRecordShareConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scope" "RecordShareScope" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'CLINIC',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientRecordShareConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientRecordShareConsent_patientId_scope_key" ON "PatientRecordShareConsent"("patientId", "scope");
CREATE INDEX "PatientRecordShareConsent_tenantId_patientId_idx" ON "PatientRecordShareConsent"("tenantId", "patientId");

ALTER TABLE "PatientRecordShareConsent" ADD CONSTRAINT "PatientRecordShareConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
