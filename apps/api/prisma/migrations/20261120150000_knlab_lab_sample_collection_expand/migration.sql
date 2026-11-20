-- CreateTable
CREATE TABLE "LabSampleCollection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "collectorUserId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "handedOverAt" TIMESTAMP(3),
    "temperatureC" DECIMAL(4,1),
    "identifiersChecked" JSONB NOT NULL,
    "consentTokenHash" TEXT NOT NULL,
    "prescriberName" TEXT,
    "outboxEventId" TEXT,
    "labStatus" TEXT NOT NULL DEFAULT 'HANDED_OFF',
    "labOrderNumber" TEXT,
    "labId" TEXT,
    "labStatusAt" TIMESTAMP(3),
    "rejectionCode" TEXT,
    "custodyJson" JSONB,
    "reportId" TEXT,
    "reportVersion" INTEGER,
    "resultSecureLink" TEXT,
    "resultReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabSampleCollection_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LabSampleTube" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "specimenType" TEXT NOT NULL,
    "container" TEXT,
    CONSTRAINT "LabSampleTube_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "LabSampleCollection_orderId_key" ON "LabSampleCollection"("orderId");
-- CreateIndex
CREATE INDEX "LabSampleCollection_tenantId_patientId_idx" ON "LabSampleCollection"("tenantId", "patientId");
-- CreateIndex
CREATE INDEX "LabSampleCollection_tenantId_appointmentId_idx" ON "LabSampleCollection"("tenantId", "appointmentId");
-- CreateIndex
CREATE INDEX "LabSampleTube_collectionId_idx" ON "LabSampleTube"("collectionId");
-- CreateIndex
CREATE UNIQUE INDEX "LabSampleTube_tenantId_label_key" ON "LabSampleTube"("tenantId", "label");
-- AddForeignKey
ALTER TABLE "LabSampleCollection" ADD CONSTRAINT "LabSampleCollection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LabSampleCollection" ADD CONSTRAINT "LabSampleCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ClinicalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LabSampleTube" ADD CONSTRAINT "LabSampleTube_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "LabSampleCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
