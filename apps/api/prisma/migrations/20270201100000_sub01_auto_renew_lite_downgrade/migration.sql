-- SUB-01: recurring subscription with auto-renew (default ON), downgrade to Lite (never lockout), maker-checker policy changes.
ALTER TABLE "Subscription"
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoRenewForced" TEXT,
  ADD COLUMN "autoRenewChangedAt" TIMESTAMP(3),
  ADD COLUMN "autoRenewChangedBy" TEXT,
  ADD COLUMN "downgradedToLiteAt" TIMESTAMP(3),
  ADD COLUMN "downgradeReason" TEXT,
  ADD COLUMN "previousPlanId" TEXT,
  ADD COLUMN "previousPlanPriceId" TEXT,
  ADD COLUMN "previousInterval" "BillingInterval",
  ADD COLUMN "previousClinicianSeats" INTEGER,
  ADD COLUMN "liteReadOnlyGraceUntil" TIMESTAMP(3);

-- Existing "cancel at period end" requests are auto-renew OFF.
UPDATE "Subscription" SET "autoRenew" = false WHERE "cancelAtPeriodEnd" = true;

CREATE INDEX "Subscription_downgradedToLiteAt_idx" ON "Subscription"("downgradedToLiteAt");
CREATE INDEX "Subscription_autoRenew_status_currentPeriodEnd_idx" ON "Subscription"("autoRenew", "status", "currentPeriodEnd");

CREATE TYPE "SubscriptionPolicyChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SubscriptionPolicyChange" (
  "id" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "status" "SubscriptionPolicyChangeStatus" NOT NULL DEFAULT 'PENDING',
  "payloadJson" JSONB NOT NULL,
  "beforeJson" JSONB,
  "reason" TEXT NOT NULL,
  "makerId" TEXT NOT NULL,
  "checkerId" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionPolicyChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionPolicyChange_marketId_status_idx" ON "SubscriptionPolicyChange"("marketId", "status");
ALTER TABLE "SubscriptionPolicyChange" ADD CONSTRAINT "SubscriptionPolicyChange_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
