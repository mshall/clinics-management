-- Patient government identifier
ALTER TABLE "Patient" ADD COLUMN "nationalId" TEXT;

CREATE UNIQUE INDEX "Patient_tenantId_nationalId_key" ON "Patient" ("tenantId", "nationalId");

CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient" ("tenantId", "phone");

-- Encounter structured vitals + no-medications flag
ALTER TABLE "Encounter" ADD COLUMN "heartRate" INTEGER,
ADD COLUMN "spo2" INTEGER,
ADD COLUMN "bpSystolic" INTEGER,
ADD COLUMN "bpDiastolic" INTEGER,
ADD COLUMN "temperature" DECIMAL(4,1),
ADD COLUMN "weightKg" DECIMAL(6,2),
ADD COLUMN "heightCm" DECIMAL(6,2),
ADD COLUMN "noMedications" BOOLEAN NOT NULL DEFAULT false;

-- Document kind enum
CREATE TYPE "EncounterDocumentKind" AS ENUM ('LAB', 'RADIOLOGY');

CREATE TABLE "EncounterMedication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterMedication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EncounterDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "kind" "EncounterDocumentKind" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "relativePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EncounterMedication_encounterId_idx" ON "EncounterMedication"("encounterId");
CREATE INDEX "EncounterMedication_tenantId_idx" ON "EncounterMedication"("tenantId");
CREATE INDEX "EncounterDocument_encounterId_idx" ON "EncounterDocument"("encounterId");
CREATE INDEX "EncounterDocument_tenantId_idx" ON "EncounterDocument"("tenantId");

ALTER TABLE "EncounterMedication" ADD CONSTRAINT "EncounterMedication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterMedication" ADD CONSTRAINT "EncounterMedication_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EncounterDocument" ADD CONSTRAINT "EncounterDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EncounterDocument" ADD CONSTRAINT "EncounterDocument_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
