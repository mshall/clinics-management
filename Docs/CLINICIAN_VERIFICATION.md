# Clinician verification (ON-03) · Kiorex gate (KX-01)

| Item | Status |
|------|--------|
| ON-03 Per-doctor verification + documents | **Done** |
| PA-03 Platform review queue (SLA, checklist, median review time) | **Done** |
| KX-01 Marketplace listing gate (appointment types) | **Done** |

> **Rev 2.3:** verification is now per profession (physician, dentist, physiotherapist, nurse) with per-register `ProfessionalRegistration`
> rows, profession-named badges, re-verification on name/profession/specialty change and licence-expiry reminders.
> See [PROFESSIONS_AND_SCOPE.md](./PROFESSIONS_AND_SCOPE.md) (PRSOP01-04, PRVER01-04).

## Purpose

Patients on **Kiorex** must book **verified** doctors. Verification is required for **marketplace listing** (`AppointmentType.marketplaceBookable`), not for day-to-day Kiorly clinic use.

## Data

`ClinicianVerification` (per `User`): syndicate number, specialty, titles, `nationalIdEnc` (AES-256-GCM at rest), `documentKeys` JSON (private upload refs), status workflow.

Statuses: `UNVERIFIED`, `PENDING`, `VERIFIED`, `REJECTED`, `EXPIRED`.

Changing specialty after `VERIFIED` moves the record back to `PENDING` for re-review.

## API

| Method | Path |
|--------|------|
| GET | `/api/v1/clinicians/me/verification` |
| POST | `/api/v1/clinicians/me/verification` (draft or `submit: true`) |
| POST | `/api/v1/clinicians/me/verification/documents/:kind` (multipart) |
| GET | `/api/v1/clinicians/me/verification/documents/:kind/file` (auth stream) |
| GET | `/api/v1/admin/platform/verifications?status=PENDING&profession=PHYSIOTHERAPIST` |
| GET | `/api/v1/admin/platform/verifications/metrics` (median review ms, pending count) |
| GET | `/api/v1/admin/platform/verifications/review-config` (checklist keys, reject templates, SLA hours) |
| POST | `/api/v1/admin/platform/verifications/:id/decision` (`checklist`, `rejectReasonCode`) |
| GET | `/api/v1/admin/platform/verifications/:id/documents/:kind/file` |

Documents use upload kind `clinicians` (local/S3 private). **No public URLs** — only JWT-protected `StreamableFile` proxies.

## Web

- Physician: `/profile/verification` + onboarding step `doctor_verification`
- Kiorex tab: verification status chip on appointment types panel
- Platform: `/platform/verifications` review queue (PA-03)

## Env

Production requires `CLINICIAN_PII_ENCRYPTION_KEY` (32-byte base64 or hex) for national ID encryption.

## PA-03 review queue

- Pending queue sorted by `pendingAt` (FIFO). SLA default **48h** (`VERIFICATION_REVIEW_SLA_HOURS`).
- Approve requires all checklist keys in `verification-review-policy.ts`.
- Reject uses templated `rejectReasonCode` (+ optional note); stored on `ClinicianVerification`.
- Each decision sets `reviewDurationMs` for **median review time** (`GET .../metrics`, last 90 days).

## Tests

- `field-crypto.node.test.ts`
- `kiorex-marketplace-gate.node.test.ts`
- `on03-verification.integration.test.ts`
- `verification-review-metrics.node.test.ts`
- `pa03-verification-review.integration.test.ts`
- Scheduling enforces gate when `marketplaceBookable` is set

## Follow-ups

- Automated expiry job (`EXPIRED`) + renewal reminders
- Per-clinician marketplace profile (public Kiorex API) beyond appointment-type flag
- Field-level KMS envelope via AWS Secrets Manager in production