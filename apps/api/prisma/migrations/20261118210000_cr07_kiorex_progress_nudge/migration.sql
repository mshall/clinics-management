CREATE TABLE "KiorexProgressNudge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorexProgressNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KiorexProgressNudge_tenantId_periodKey_threshold_key" ON "KiorexProgressNudge"("tenantId", "periodKey", "threshold");
CREATE INDEX "KiorexProgressNudge_tenantId_periodKey_idx" ON "KiorexProgressNudge"("tenantId", "periodKey");