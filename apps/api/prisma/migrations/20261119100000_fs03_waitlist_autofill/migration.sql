-- FS-03: waitlist auto-fill (open slots + one pending offer per slot)
-- CreateEnum
CREATE TYPE "WaitlistOpenSlotStatus" AS ENUM ('OPEN', 'FILLED', 'FILLED_ELSEWHERE', 'EXHAUSTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WaitlistOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'SKIPPED');

-- CreateTable
CREATE TABLE "WaitlistOpenSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "appointmentTypeId" TEXT,
    "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sourceAppointmentId" TEXT,
    "status" "WaitlistOpenSlotStatus" NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "filledAppointmentId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistOpenSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistSlotOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "WaitlistOfferStatus" NOT NULL DEFAULT 'PENDING',
    "activeSlotId" TEXT,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "outboundMessageId" TEXT,
    "bookedAppointmentId" TEXT,
    "skipReason" TEXT,

    CONSTRAINT "WaitlistSlotOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistOpenSlot_openKey_key" ON "WaitlistOpenSlot"("openKey");

-- CreateIndex
CREATE INDEX "WaitlistOpenSlot_tenantId_status_idx" ON "WaitlistOpenSlot"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSlotOffer_activeSlotId_key" ON "WaitlistSlotOffer"("activeSlotId");

-- CreateIndex
CREATE INDEX "WaitlistSlotOffer_tenantId_status_expiresAt_idx" ON "WaitlistSlotOffer"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "WaitlistSlotOffer_waitlistEntryId_idx" ON "WaitlistSlotOffer"("waitlistEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistSlotOffer_slotId_waitlistEntryId_key" ON "WaitlistSlotOffer"("slotId", "waitlistEntryId");

-- AddForeignKey
ALTER TABLE "WaitlistOpenSlot" ADD CONSTRAINT "WaitlistOpenSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistSlotOffer" ADD CONSTRAINT "WaitlistSlotOffer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistSlotOffer" ADD CONSTRAINT "WaitlistSlotOffer_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WaitlistOpenSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistSlotOffer" ADD CONSTRAINT "WaitlistSlotOffer_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "AppointmentWaitlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
