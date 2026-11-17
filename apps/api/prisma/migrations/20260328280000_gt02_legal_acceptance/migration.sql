-- GT-02: versioned legal acceptance
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalAcceptance_tenantId_userId_document_idx" ON "LegalAcceptance"("tenantId", "userId", "document");
CREATE INDEX "LegalAcceptance_userId_document_version_idx" ON "LegalAcceptance"("userId", "document", "version");

ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;