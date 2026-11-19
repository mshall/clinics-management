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
