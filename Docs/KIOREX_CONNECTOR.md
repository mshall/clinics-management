# Kiorex connector (GT-06 hub)

How Kiorly talks to the **Kiorex** patient marketplace (HMAC marketplace API, commissions, deposits, outbox).

| Area | Doc | Status |
|------|-----|--------|
| Marketplace listings & slots | [KIOREX_MARKETPLACE.md](./KIOREX_MARKETPLACE.md) | **Shipped** (KX-01+) |
| Booking attribution | [BOOKING_ATTRIBUTION.md](./BOOKING_ATTRIBUTION.md) | **Shipped** (CR-02) |
| Commission fees | [KIOREX_FEES.md](./KIOREX_FEES.md) | **Shipped** (CR-04) |
| Commission charges & disputes | [KIOREX_COMMISSION_CHARGES.md](./KIOREX_COMMISSION_CHARGES.md) | **Shipped** (CR-03/CR-08) |
| Impact reports | [REPORTS_KIOREX_IMPACT.md](./REPORTS_KIOREX_IMPACT.md) | **Shipped** (RP-03) |
| OpenAPI consumer contract | [QA_KIOREX_CONTRACT.md](./QA_KIOREX_CONTRACT.md) | **Shipped** (QA-04; NH-019 Kiorex CI) |
| Sales kit / free calculator | [SALES_KIT.md](./SALES_KIT.md) · [PLANS_AND_PRICING.md](./PLANS_AND_PRICING.md) | **Shipped** (GT-01/GT-05) |
| Consent-based record sharing | [KX11_RECORD_SHARE.md](./KX11_RECORD_SHARE.md) | **Shipped** (KX-11) |

| Feature-flag control plane (snapshot client, `flag.changed` webhook, FEATURE_DISABLED) | [FEATURE_FLAGS.md](./FEATURE_FLAGS.md) | **Shipped** (FF01–FF06) |
| Sign in with Kiorex Passport (OIDC, account link, back-channel logout) | [AUTH_SESSIONS.md](./AUTH_SESSIONS.md) | **Shipped** (KCV-201) |
| Local integration seed (marketplace client, webhook target, 3 live doctors) | below | **Shipped** (KX-DEV) |

**Data residency:** marketplace traffic follows the market cell; EG production stays Path A Frankfurt unless counsel signs Path B — [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md).

## Local Kiorex integration (dev seed, KX-DEV)

`npm run db:seed -w api` (also run by `db:setup`) idempotently ensures, via `apps/api/prisma/kiorex-dev.seed.ts`:

| Item | Value |
|------|-------|
| Marketplace client (`PlatformIntegrationClient`, scope `MARKETPLACE`) | key `kx_dev_client`, secret `kx_dev_secret_change_me` (HMAC headers per `marketplace-hmac.ts`) |
| Kiorly → Kiorex webhook target | The Kiorex target is env-driven (`OutboxDeliveryService`), not a table: set `KIOREX_OUTBOX_WEBHOOK_URL=http://localhost:4000/api/v1/webhooks/kiorly` and `KIOREX_OUTBOX_WEBHOOK_SECRET=kx_dev_webhook_secret` (already in `.env.example` and the local `.env`). Tenant-level `IntegrationWebhook` rows are *not* created to avoid double delivery. |
| Tenant | "Kiorex Dev Marketplace Group" (EG market, PRO, ACTIVE) |
| Clinics | Nile Family Clinic — Zamalek (Cairo), Pyramids Heart & Care Center — Dokki (Giza), with geo + AR/EN address |
| LIVE verified doctors | Dr Mona Fahmy (paediatrics, Cairo), Dr Karim Adel (dermatology, Cairo), Dr Hesham Nabil (cardiology, Giza); logins `kxdev.*@kiorly.dev` / `demo` |
| Schedule | Sat–Thu 09:00–13:00 and 16:00–20:00 (Africa/Cairo); Consultation 30 min + Follow-up 15 min, both `marketplaceBookable` ⇒ slots for the next 14 days |

Verify: `GET http://localhost:3000/api/v1/marketplace/v1/clinics` (signed) lists the two clinics; `kx-dev-seed.integration.test.ts` asserts idempotency, LIVE eligibility via the real recompute, and ≥ 20 slots over 14 days per doctor.
