-- Kiorex org-onboarding import receiver: org map, batch and idempotency/rollback ledger (additive).
CREATE TABLE "KiorexImportOrg" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kiorexOrgId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "importerUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KiorexImportOrg_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KiorexImportOrg_clientId_kiorexOrgId_key" ON "KiorexImportOrg"("clientId", "kiorexOrgId");
CREATE INDEX "KiorexImportOrg_tenantId_idx" ON "KiorexImportOrg"("tenantId");

CREATE TABLE "KiorexImportBatch" (
  "id" TEXT NOT NULL,
  "orgRowId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kiorexBatchId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rolledBackAt" TIMESTAMP(3),
  CONSTRAINT "KiorexImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KiorexImportBatch_clientId_kiorexBatchId_key" ON "KiorexImportBatch"("clientId", "kiorexBatchId");

CREATE TABLE "KiorexImportItem" (
  "id" TEXT NOT NULL,
  "batchRowId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "created" BOOLEAN NOT NULL DEFAULT true,
  "storageKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KiorexImportItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KiorexImportItem_batchRowId_idempotencyKey_key" ON "KiorexImportItem"("batchRowId", "idempotencyKey");
CREATE INDEX "KiorexImportItem_batchRowId_entity_idx" ON "KiorexImportItem"("batchRowId", "entity");

ALTER TABLE "KiorexImportBatch" ADD CONSTRAINT "KiorexImportBatch_orgRowId_fkey" FOREIGN KEY ("orgRowId") REFERENCES "KiorexImportOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KiorexImportItem" ADD CONSTRAINT "KiorexImportItem_batchRowId_fkey" FOREIGN KEY ("batchRowId") REFERENCES "KiorexImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
