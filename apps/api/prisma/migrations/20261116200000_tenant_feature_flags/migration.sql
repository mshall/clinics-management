-- Tenant-level feature flag overrides (market + global cascade in app)

CREATE TABLE "TenantFeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantFeatureFlag_tenantId_key_key" ON "TenantFeatureFlag"("tenantId", "key");

ALTER TABLE "TenantFeatureFlag" ADD CONSTRAINT "TenantFeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Product feature keys (platform-wide master switches)
INSERT INTO "FeatureFlag" ("id", "key", "enabled", "description", "updatedAt") VALUES
    ('ff-eta-receipts', 'eta_receipts', true, 'Egypt ETA / fiscal e-receipt submissions', CURRENT_TIMESTAMP),
    ('ff-whatsapp', 'whatsapp_reminders', true, 'WhatsApp appointment reminders', CURRENT_TIMESTAMP),
    ('ff-instapay', 'instapay', true, 'InstaPay money transfer at check-in', CURRENT_TIMESTAMP),
    ('ff-fawry', 'fawry', true, 'Fawry money transfer at check-in', CURRENT_TIMESTAMP),
    ('ff-card', 'card_payments', true, 'Card payments at billing desk', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Egypt market flags (country pack defaults)
INSERT INTO "MarketFeatureFlag" ("id", "marketId", "key", "enabled", "description", "createdAt", "updatedAt") VALUES
    ('mff-eg-eta', 'market-egypt', 'eta_receipts', true, 'ETA e-receipts for Egypt', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mff-eg-wa', 'market-egypt', 'whatsapp_reminders', false, 'WhatsApp BSP (off until credentials)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mff-eg-ip', 'market-egypt', 'instapay', true, 'InstaPay', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mff-eg-faw', 'market-egypt', 'fawry', true, 'Fawry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mff-eg-card', 'market-egypt', 'card_payments', true, 'Card', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("marketId", "key") DO NOTHING;