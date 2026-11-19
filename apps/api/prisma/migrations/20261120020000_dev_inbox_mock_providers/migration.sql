-- Mock-mode dev inbox: rendered messages and simulated replies (additive).
CREATE TABLE "DevInboxMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "tenantId" TEXT,
    "toAddress" TEXT NOT NULL,
    "fromAddress" TEXT,
    "templateKey" TEXT,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "variablesJson" JSONB,
    "quickReplies" JSONB,
    "documentLink" TEXT,
    "providerMessageId" TEXT,
    "relatedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "statusHistory" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "DevInboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevInboxMessage_providerMessageId_key" ON "DevInboxMessage"("providerMessageId");
CREATE INDEX "DevInboxMessage_channel_createdAt_idx" ON "DevInboxMessage"("channel", "createdAt");
CREATE INDEX "DevInboxMessage_toAddress_createdAt_idx" ON "DevInboxMessage"("toAddress", "createdAt");
CREATE INDEX "DevInboxMessage_tenantId_createdAt_idx" ON "DevInboxMessage"("tenantId", "createdAt");
