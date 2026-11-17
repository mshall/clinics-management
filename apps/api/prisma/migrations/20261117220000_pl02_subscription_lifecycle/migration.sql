-- PL-02: subscription lifecycle (replaces TenantPlanSubscription)

CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'READ_ONLY', 'SUSPENDED', 'CANCELLED');

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planPriceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "clinicianSeats" INTEGER NOT NULL DEFAULT 1,
    "trialStartsAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "trialPlanId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "prepaidUntil" TIMESTAMP(3),
    "cohortKey" TEXT,
    "priceLockUntil" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "defaultPaymentMethodId" TEXT,
    "salesRepCode" TEXT,
    "referralCodeUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE INDEX "Subscription_planPriceId_idx" ON "Subscription"("planPriceId");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");
CREATE INDEX "Subscription_status_trialEndsAt_idx" ON "Subscription"("status", "trialEndsAt");

CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromJson" JSONB,
    "toJson" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_subscriptionId_createdAt_idx" ON "SubscriptionEvent"("subscriptionId", "createdAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planPriceId_fkey" FOREIGN KEY ("planPriceId") REFERENCES "PlanPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_trialPlanId_fkey" FOREIGN KEY ("trialPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate rows from TenantPlanSubscription when present
INSERT INTO "Subscription" (
    "id", "tenantId", "planId", "planPriceId", "status", "interval", "clinicianSeats",
    "currentPeriodStart", "currentPeriodEnd", "activatedAt", "createdAt", "updatedAt"
)
SELECT
    tps."id",
    tps."tenantId",
    tps."planId",
    tps."planPriceId",
    CASE WHEN tps."status" = 'CANCELLED' THEN 'CANCELLED'::"SubscriptionStatus" ELSE 'ACTIVE'::"SubscriptionStatus" END,
  'MONTHLY'::"BillingInterval",
    1,
    tps."startedAt",
    tps."startedAt" + INTERVAL '1 month',
    tps."startedAt",
    tps."createdAt",
    tps."updatedAt"
FROM "TenantPlanSubscription" tps
ON CONFLICT ("tenantId") DO NOTHING;

INSERT INTO "SubscriptionEvent" ("id", "subscriptionId", "type", "toJson", "createdAt")
SELECT
    'subevt_mig_' || s."id",
    s."id",
    'created',
    jsonb_build_object('status', s."status"::text, 'migratedFrom', 'TenantPlanSubscription'),
    s."createdAt"
FROM "Subscription" s
WHERE NOT EXISTS (
    SELECT 1 FROM "SubscriptionEvent" e WHERE e."subscriptionId" = s."id" AND e."type" = 'created'
);

-- Backfill tenants without a subscription → ENTERPRISE ACTIVE
INSERT INTO "Subscription" (
    "id", "tenantId", "planId", "planPriceId", "status", "interval", "clinicianSeats",
    "currentPeriodStart", "currentPeriodEnd", "activatedAt", "createdAt", "updatedAt"
)
SELECT
    'sub_bf_' || t."id",
    t."id",
    p."id",
    (
        SELECT pp."id" FROM "PlanPrice" pp
        WHERE pp."planId" = p."id"
          AND pp."marketId" = t."marketId"
          AND pp."interval" = 'MONTHLY'
          AND pp."validTo" IS NULL
        ORDER BY pp."priceVersion" DESC
        LIMIT 1
    ),
    'ACTIVE'::"SubscriptionStatus",
    'MONTHLY'::"BillingInterval",
    5,
    NOW(),
    NOW() + INTERVAL '1 month',
    NOW(),
    NOW(),
    NOW()
FROM "Tenant" t
INNER JOIN "Plan" p ON p."key" = 'ENTERPRISE'
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."tenantId" = t."id");

INSERT INTO "SubscriptionEvent" ("id", "subscriptionId", "type", "toJson", "createdAt")
SELECT
    'subevt_bf_' || s."id",
    s."id",
    'created',
    jsonb_build_object('status', 'ACTIVE', 'planKey', 'ENTERPRISE', 'backfill', true),
    s."createdAt"
FROM "Subscription" s
WHERE NOT EXISTS (
    SELECT 1 FROM "SubscriptionEvent" e WHERE e."subscriptionId" = s."id" AND e."type" = 'created'
);

DROP TABLE "TenantPlanSubscription";
DROP TYPE "TenantPlanSubscriptionStatus";