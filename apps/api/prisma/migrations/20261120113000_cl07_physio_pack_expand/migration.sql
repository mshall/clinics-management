-- DropIndex
DROP INDEX "User_supervisorUserId_idx";

-- CreateTable
CREATE TABLE "PhysioReferral" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "referringDoctorName" TEXT,
    "diagnosis" TEXT,
    "documentKey" TEXT,
    "externalRef" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysioReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "encounterId" TEXT,
    "complaint" TEXT NOT NULL,
    "history" TEXT NOT NULL DEFAULT '',
    "painNrs" INTEGER NOT NULL,
    "rom" JSONB NOT NULL DEFAULT '[]',
    "strength" JSONB NOT NULL DEFAULT '[]',
    "specialTests" JSONB NOT NULL DEFAULT '[]',
    "functionalGoals" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysioAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioTreatmentPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "clinicId" TEXT,
    "referralId" TEXT,
    "assessmentId" TEXT,
    "packageId" TEXT,
    "seriesId" TEXT,
    "sessionCount" INTEGER NOT NULL,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "frequencyPerWeek" INTEGER NOT NULL,
    "modalities" JSONB NOT NULL DEFAULT '[]',
    "homeProgramme" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dischargeSummary" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysioTreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioProgressNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "sessionNo" INTEGER NOT NULL,
    "subjective" TEXT NOT NULL DEFAULT '',
    "intervention" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL DEFAULT '',
    "nextPlan" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysioProgressNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioOutcomeMeasure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "planId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "side" TEXT,
    "value" DECIMAL(8,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysioOutcomeMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysioHepLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysioHepLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhysioReferral_externalRef_key" ON "PhysioReferral"("externalRef");

-- CreateIndex
CREATE INDEX "PhysioReferral_tenantId_patientId_idx" ON "PhysioReferral"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PhysioAssessment_tenantId_patientId_idx" ON "PhysioAssessment"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PhysioTreatmentPlan_tenantId_patientId_idx" ON "PhysioTreatmentPlan"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PhysioProgressNote_tenantId_patientId_idx" ON "PhysioProgressNote"("tenantId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PhysioProgressNote_planId_sessionNo_key" ON "PhysioProgressNote"("planId", "sessionNo");

-- CreateIndex
CREATE INDEX "PhysioOutcomeMeasure_tenantId_patientId_kind_label_idx" ON "PhysioOutcomeMeasure"("tenantId", "patientId", "kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "PhysioHepLink_tokenHash_key" ON "PhysioHepLink"("tokenHash");

-- AddForeignKey
ALTER TABLE "PhysioReferral" ADD CONSTRAINT "PhysioReferral_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioAssessment" ADD CONSTRAINT "PhysioAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioTreatmentPlan" ADD CONSTRAINT "PhysioTreatmentPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioTreatmentPlan" ADD CONSTRAINT "PhysioTreatmentPlan_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "PhysioReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioProgressNote" ADD CONSTRAINT "PhysioProgressNote_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PhysioTreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysioHepLink" ADD CONSTRAINT "PhysioHepLink_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PhysioTreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

