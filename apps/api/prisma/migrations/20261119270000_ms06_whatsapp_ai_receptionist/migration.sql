-- CreateEnum
CREATE TYPE "ReceptionistIntent" AS ENUM ('BOOKING', 'RESCHEDULE', 'PRICES', 'LOCATION', 'HOURS', 'CLINICAL', 'HANDOVER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "WhatsAppReceptionistTurn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT,
    "fromPhone" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "inboundText" TEXT NOT NULL,
    "intent" "ReceptionistIntent" NOT NULL,
    "replyText" TEXT NOT NULL,
    "handedOver" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppReceptionistTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceptionistTurn_providerMessageId_key" ON "WhatsAppReceptionistTurn"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppReceptionistTurn_tenantId_createdAt_idx" ON "WhatsAppReceptionistTurn"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceptionistTurn_tenantId_handedOver_createdAt_idx" ON "WhatsAppReceptionistTurn"("tenantId", "handedOver", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppReceptionistTurn_fromPhone_idx" ON "WhatsAppReceptionistTurn"("fromPhone");

-- AddForeignKey
ALTER TABLE "WhatsAppReceptionistTurn" ADD CONSTRAINT "WhatsAppReceptionistTurn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
