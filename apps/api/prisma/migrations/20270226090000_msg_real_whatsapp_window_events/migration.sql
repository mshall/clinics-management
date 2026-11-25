-- MSG-REAL: WhatsApp 24 h window per customer and account-level webhook events. Additive.
CREATE TABLE "WhatsAppContactWindow" (
  "id" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "lastInboundAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppContactWindow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppContactWindow_phoneNumberId_phone_key" ON "WhatsAppContactWindow"("phoneNumberId", "phone");
CREATE INDEX "WhatsAppContactWindow_lastInboundAt_idx" ON "WhatsAppContactWindow"("lastInboundAt");

CREATE TABLE "WhatsAppChannelEvent" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT,
  "language" TEXT,
  "event" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppChannelEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppChannelEvent_kind_createdAt_idx" ON "WhatsAppChannelEvent"("kind", "createdAt");
