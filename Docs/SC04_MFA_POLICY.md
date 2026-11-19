# MFA policy (SC-04)

## Enforcement

- Privileged roles (owner, group/clinic admin, supervisor, branch manager, finance) **and tenant owners** must enable MFA in every **production-like** environment (`KIORLY_ENV=staging|production`, AWS deploy, or `PRIVILEGED_MFA_ENFORCE=true`).
- Local/dev is off unless explicitly forced.
- **7-day grace** from `User.createdAt`. After day 7, billing and all privileged routes return `401 MFA_SETUP_REQUIRED` until MFA is enabled.

## Factors

- **TOTP** (authenticator) — owners/admins/finance (existing `/auth/mfa/setup` + confirm).
- **WhatsApp OTP** — physicians may enable via `POST /auth/mfa/whatsapp/enable`; login accepts the OTP as `mfaCode` (challenge: `POST /auth/mfa/whatsapp/challenge`).

## UI

- Profile MFA panel (TOTP).
- Onboarding: owners are prompted to set up MFA before the grace window ends.

## Tests

- `privileged-mfa-enforcement.node.test.ts`
- `sc04-mfa-policy.integration.test.ts`
