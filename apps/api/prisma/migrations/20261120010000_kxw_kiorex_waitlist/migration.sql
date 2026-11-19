-- KXW: Kiorex-sourced waitlist entries (join/leave via marketplace/v1/waitlist). Additive only.
ALTER TABLE "AppointmentWaitlistEntry" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'CLINIC';
ALTER TABLE "AppointmentWaitlistEntry" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "AppointmentWaitlistEntry" ADD COLUMN "platformIntegrationClientId" TEXT;
CREATE UNIQUE INDEX "AppointmentWaitlistEntry_externalRef_key" ON "AppointmentWaitlistEntry"("externalRef");
