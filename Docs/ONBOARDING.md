# Onboarding wizard & activation (ON-04)

| Item | Status |
|------|--------|
| ON-04 Checklist API + dashboard card | **Done** |

## Purpose

Resumable, skippable activation checklist for new tenants (after ON-01 signup). Drives first real bookings in the first 14 days (conversion predictor).

## Data

`OnboardingProgress` (per tenant): `stepsJson` ISO timestamps or `"skipped"`, `completedAt`, `activatedAt`.

## API

- `GET /api/v1/onboarding` — sync auto-detected steps from clinic data, return checklist + progress.
- `PATCH /api/v1/onboarding/steps/:key` — body `{ "action": "complete" | "skip" }` (required steps cannot skip).

## CR-01 activation

Tenant is **activated** when **first appointment** and **first check-in** steps are satisfied (auto-detect from data or timestamps). Writes audit `TENANT_ACTIVATED` and sets `activatedAt`. UI celebrates on `activationJustAchieved`.

## Required vs optional

**Required (6):** clinic profile, working hours, appointment types, doctor availability, first appointment, first check-in.

**Optional (skippable):** logo, invite receptionist, WhatsApp, patient import, ETA, Kiorex profile.

## Web

- `/onboarding` full-page checklist (post-signup landing).
- Dashboard card for tenant owners until `completedAt`.

## Tests

- `on04-onboarding.node.test.ts` — CR-01, median pilot path &lt; 30 minutes.
- `on04-onboarding.integration.test.ts` — skip rules, auto activation on check-in.

## Follow-ups

- Dedicated scheduling UI deep link for clinician availability.
- Kiorex verification workflow when marketplace API ships.
- Product analytics export for median time in production (pilot sessions).