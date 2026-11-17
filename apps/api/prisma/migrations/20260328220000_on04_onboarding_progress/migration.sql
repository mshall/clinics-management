-- ON-04: tenant onboarding checklist progress
CREATE TABLE "OnboardingProgress" (
    "tenantId" TEXT NOT NULL,
    "stepsJson" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OnboardingProgress" ("tenantId", "stepsJson", "updatedAt")
SELECT "id", '{}', NOW() FROM "Tenant"
ON CONFLICT ("tenantId") DO NOTHING;