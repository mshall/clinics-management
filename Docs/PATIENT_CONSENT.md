# SC-03 — Consent enforcement

| Item | Status |
|------|--------|
| SC-03 ConsentPolicy + capture + UI chips | **Done** |

## Purposes

| Purpose | Enforced on |
|---------|-------------|
| `DATA_PROCESSING` | PDPL tablet/staff capture; legacy `PatientDataProtectionConsent` counts as granted |
| `AI_PROCESSING` | `AiGateway.chatCompletion` when `patientId` is set |
| `MARKETPLACE_SHARING` | Kiorex / integration `POST integrations/appointments` before webhook |
| `MESSAGING_MARKETING` | Marketing WhatsApp/SMS (`recall_*`, MS-03) |

## API

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/patients/:id/consents` | Unified status per purpose |
| `POST` | `/api/v1/compliance/patients/:id/data-protection-consent` | Also upserts `DATA_PROCESSING` |
| `POST` | `/api/v1/front-desk/appointments/:id/check-in` | Optional `consentCapture` (tablet / receptionist) |
| Integration book | `marketplaceConsentGranted: true` | Records Kiorex consent then enforces |

## Code

- `ConsentPolicyService.require(tenantId, patientId, purpose)`
- `AiGatewayService` — LLM entry with consent gate
- Errors: `PATIENT_CONSENT_*_REQUIRED` with EN message (AR in constants)

## UI

Patient chart header — consent chips (`patientConsent.*`).

## Tests

- `sc03-consent-policy.node.test.ts`
- `sc03-consent-policy.integration.test.ts` — AI, marketplace, marketing

## Follow-ups

- Tablet signature capture UI on check-in (payload fields exist).
- Per-channel marketing chip beyond WhatsApp default in list API.
- Wire encounter scribe LLM through `AiGateway` with encounter `patientId`.