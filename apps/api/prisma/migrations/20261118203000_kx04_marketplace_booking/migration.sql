-- KX-04: slot holds, platform idempotency, clinic auto-confirm
ALTER TABLE "Clinic" ADD COLUMN "marketplaceBookingAutoConfirm" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Appointment" ADD COLUMN "platformIntegrationClientId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "marketplaceConfirmationDueAt" TIMESTAMP(3);

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_platformIntegrationClientId_fkey"
  FOREIGN KEY ("platformIntegrationClientId") REFERENCES "PlatformIntegrationClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Appointment_platformIntegrationClientId_externalReference_key"
  ON "Appointment"("platformIntegrationClientId", "externalReference");

CREATE TABLE "SlotHold" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "clinicianId" TEXT NOT NULL,
  "appointmentTypeId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "externalRef" TEXT NOT NULL,
  "platformIntegrationClientId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlotHold_externalRef_key" ON "SlotHold"("externalRef");
CREATE INDEX "SlotHold_clinicianId_startsAt_idx" ON "SlotHold"("clinicianId", "startsAt");
CREATE INDEX "SlotHold_expiresAt_idx" ON "SlotHold"("expiresAt");
CREATE INDEX "SlotHold_tenantId_clinicId_idx" ON "SlotHold"("tenantId", "clinicId");

ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_appointmentTypeId_fkey" FOREIGN KEY ("appointmentTypeId") REFERENCES "AppointmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_platformIntegrationClientId_fkey" FOREIGN KEY ("platformIntegrationClientId") REFERENCES "PlatformIntegrationClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;