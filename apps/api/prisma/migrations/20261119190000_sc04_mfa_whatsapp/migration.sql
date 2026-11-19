-- SC-04 WhatsApp OTP MFA option for physicians
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaWhatsAppEnabled" BOOLEAN NOT NULL DEFAULT false;
