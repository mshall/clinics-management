-- CreateTable
CREATE TABLE "KiorexFlagSnapshot" (
    "product" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "etag" TEXT,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexFlagSnapshot_pkey" PRIMARY KEY ("product")
);

-- CreateTable
CREATE TABLE "KiorexFlagAuditEvent" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "fromVersion" INTEGER,
    "toVersion" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorexFlagAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KiorexFlagAuditEvent_product_createdAt_idx" ON "KiorexFlagAuditEvent"("product", "createdAt");

