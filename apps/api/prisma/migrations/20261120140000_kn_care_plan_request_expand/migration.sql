-- CreateTable
CREATE TABLE "CarePlanRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT,
    "typeId" TEXT,
    "requestRef" TEXT NOT NULL,
    "preferredStartDate" DATE,
    "notes" TEXT,
    "visitAddressCiphertext" TEXT,
    "patientPhone" TEXT NOT NULL,
    "patientFirstName" TEXT NOT NULL,
    "patientLastName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "carePlanId" TEXT,
    "declineReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarePlanRequest_requestRef_key" ON "CarePlanRequest"("requestRef");

-- CreateIndex
CREATE INDEX "CarePlanRequest_tenantId_status_createdAt_idx" ON "CarePlanRequest"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "CarePlanRequest" ADD CONSTRAINT "CarePlanRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
