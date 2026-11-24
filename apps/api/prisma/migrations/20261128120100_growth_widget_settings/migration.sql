-- GRW-P1-D1: widget branding, languages and doctor/branch selection (additive, idempotent).
ALTER TABLE "BookingWidgetConfig" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
