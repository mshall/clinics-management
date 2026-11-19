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
- `PRESCRIPTION_SHARED` — when prescriptions scope granted and meds exist; carries `pdf: { url, expiresAt }`, a signed expiring public link to the same Rx PDF the clinic prints (CL-03 verification token, TTL from the market pack, default 14 days). Kiorex fetches it into the patient vault before it expires.

The Kiorex `POST /marketplace/v1/patients/:id/consents` endpoint is guarded by `clinic.record_share_patient_app`: **grants** return `403 FEATURE_DISABLED` when OFF, **revocations always succeed** (consent withdrawal is a safety control, ADR-025).

**Nothing is shared without an active consent for that scope.**

## UI

Patient profile → **Kiorex patient app sharing** toggles (EN/AR).

## Tests

- `marketplace/kx11-record-share.node.test.ts`
- `marketplace/kx11-record-share.integration.test.ts`
