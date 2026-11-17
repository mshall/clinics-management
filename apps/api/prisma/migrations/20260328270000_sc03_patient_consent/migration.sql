-- SC-03: Patient consent purposes (AI, marketplace, data processing)
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signerName" TEXT,
    "signedOnTablet" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientConsent_patientId_purpose_key" ON "PatientConsent"("patientId", "purpose");
CREATE INDEX "PatientConsent_tenantId_patientId_idx" ON "PatientConsent"("tenantId", "patientId");

ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;