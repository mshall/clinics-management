-- MS-03: Messaging consent (transactional vs marketing), PDPL opt-out
CREATE TABLE "MessagingConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingConsent_patientId_channel_purpose_key" ON "MessagingConsent"("patientId", "channel", "purpose");
CREATE INDEX "MessagingConsent_tenantId_patientId_idx" ON "MessagingConsent"("tenantId", "patientId");

ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingConsent" ADD CONSTRAINT "MessagingConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;