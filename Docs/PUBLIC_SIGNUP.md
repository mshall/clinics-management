# Public self-serve signup (ON-01)

| Item | Status |
|------|--------|
| ON-01 Public signup (phone OTP) | **Done** |
| ON-04 Full onboarding checklist UI | **Done** — see [ONBOARDING.md](./ONBOARDING.md) |

## Flow

1. `GET /api/v1/public/signup/markets` — live markets accepting tenants  
2. `POST /api/v1/public/signup/otp` — WhatsApp-first OTP (SMS fallback TBD)  
3. `POST /api/v1/public/signup/verify` → `signupToken` (30m JWT)  
4. `POST /api/v1/public/signup/complete` — atomic provision + login session  

Web: mobile-first wizard at `/signup` (Arabic-first copy in `ar.json`), lands on `/onboarding`.

## Provisioning (single transaction)

Creates: `Tenant`, `Clinic` (no fiscal device), owner `User` (physician + group admin), `Employee`, `Subscription` (+ Pro trial when selected), `CreditWallet`, default `AppointmentType` rows, `ClinicianAvailabilityTemplate`, `MessageTemplate` seeds, role/user nav presets, `SIGNUP_COMPLETED` audit event.

Query params: `ref`, `rep` / `salesRepCode`, `referralCode` stored on `Tenant`.

## Abuse controls

Per-phone and per-IP OTP rate limits, OTP attempt cap, disposable-email block. Optional captcha not implemented.

## Local dev

Set `SIGNUP_OTP_DEV_CODE=424242` (or any 4+ digits) to fix the OTP for tests and E2E.

Session management and password reset are documented in [AUTH_SESSIONS.md](./AUTH_SESSIONS.md).

## Follow-ups

- Real SMS fallback provider and delivery status  
- Captcha on `otp` when abuse signals fire  
- Virtual fiscal device when ETA entitlement is enabled post-signup  