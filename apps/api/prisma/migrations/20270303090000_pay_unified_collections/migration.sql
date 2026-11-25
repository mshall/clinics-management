-- Kiorly Pay unified collections: IPN matching queue and amount-locked payment links. Idempotent.
CREATE TABLE IF NOT EXISTS "ClinicPayMatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "bankRef" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "payerMasked" TEXT,
    "eventKind" TEXT NOT NULL DEFAULT 'payment.captured',
    "decision" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "targetInvoiceId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "paymentId" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicPayMatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicPayMatch_amount_pos" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicPayMatch_tenantId_dedupeKey_key" ON "ClinicPayMatch"("tenantId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "ClinicPayMatch_tenantId_status_createdAt_idx" ON "ClinicPayMatch"("tenantId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "ClinicPayLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "rail" TEXT NOT NULL DEFAULT 'bank_transfer',
    "qrKind" TEXT NOT NULL DEFAULT 'LINK',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicPayLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicPayLink_amount_pos" CHECK ("amount" > 0)
);
CREATE INDEX IF NOT EXISTS "ClinicPayLink_tenantId_clinicId_createdAt_idx" ON "ClinicPayLink"("tenantId", "clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClinicPayLink_tenantId_subjectId_idx" ON "ClinicPayLink"("tenantId", "subjectId");
