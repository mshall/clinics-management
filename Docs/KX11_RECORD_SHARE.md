# KX-11 — Consent-based record sharing with the patient app

Patients opt in per scope before any visit summary or prescription is pushed to Kiorex.

## Scopes (`RecordShareScope`)

| Scope | Meaning |
|-------|---------|
| `VISIT_SUMMARY` | Signed SOAP / visit summary |
| `PRESCRIPTIONS` | Signed Rx (when meds exist) |
| `LAB_RESULTS` | Reserved for CL-06 results |
| `SHARE_WITH_OTHER_CLINICS` | Cross-clinic share flag (stored; enforced later) |

Model: `PatientRecordShareConsent` (unique per patient+scope). Revocation sets `granted=false` + `revokedAt` and enqueues `RECORD_SHARE_REVOKED` (Kiorex delete request).

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `POST /marketplace/v1/patients/:id/consents` | Marketplace HMAC | Body `{ consents: [{ scope, granted }] }` |
| `GET/PUT /patients/:id/record-share-consent` | Tenant JWT | Clinic UI toggles |

## Share path

After encounter sign-off (`EncountersService`), `RecordShareService.shareAfterSignOff` checks active consents and enqueues:

- `VISIT_SUMMARY_SHARED` — signed summary + HMAC signature (`KIOREX_RECORD_SHARE_HMAC_SECRET`)
- `PRESCRIPTION_SHARED` — when prescriptions scope granted and meds exist

**Nothing is shared without an active consent for that scope.**

## UI

Patient profile → **Kiorex patient app sharing** toggles (EN/AR).

## Tests

- `marketplace/kx11-record-share.node.test.ts`
- `marketplace/kx11-record-share.integration.test.ts`
