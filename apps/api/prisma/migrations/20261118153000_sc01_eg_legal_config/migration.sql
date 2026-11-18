-- SC-01: demo cross-border legal pack for EG (closed pilot; replace approvalRef before production PHI)
UPDATE "Market"
SET "legalConfig" = '{
  "crossBorderTransfer": {
    "approvalRef": "DEMO-SC-01-NON-PROD",
    "issuedAt": "2026-01-01",
    "expiresAt": "2028-12-31",
    "destination": "DE (eu-central-1)",
    "scope": "Local dev and closed pilot until PDPC cross-border approval is recorded",
    "subProcessors": ["aws-eu-central-1", "openai-eu", "whatsapp-bsp", "ses-eu", "paymob"]
  },
  "pilotException": {
    "active": true,
    "legalRef": "platform-closed-pilot-2026",
    "note": "Not for live Egyptian patient data in production without government approval",
    "expiresAt": "2028-12-31"
  }
}'::jsonb
WHERE "code" = 'EG';