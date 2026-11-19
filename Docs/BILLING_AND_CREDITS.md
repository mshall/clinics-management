# Billing & credits (GT-06 hub)

Index for Kiorly **SaaS billing** (clinic → Kiorly) and **patient-side money** (clinic → patient). Patient payments always post through `postRevenue` — never ETA.

| Area | Doc | Status |
|------|-----|--------|
| Plan catalog & public prices | [PLANS_AND_PRICING.md](./PLANS_AND_PRICING.md) | **Shipped** (PL-01) |
| Entitlement matrix | [PLANS_AND_ENTITLEMENTS.md](./PLANS_AND_ENTITLEMENTS.md) | **Shipped** (PL-04) |
| Credit wallet | [CREDIT_WALLET.md](./CREDIT_WALLET.md) | **Shipped** (CR-05) |
| Kiorly invoices (SaaS) | [KIORLY_INVOICES.md](./KIORLY_INVOICES.md) | **Shipped** (SB-01) |
| Kiorly payments | [KIORLY_PAYMENTS.md](./KIORLY_PAYMENTS.md) | **Shipped** (SB-02) |
| Dunning | [DUNNING.md](./DUNNING.md) | **Shipped** (SB-03) |
| Monthly settlement (higher-of) | [MONTHLY_SETTLEMENT.md](./MONTHLY_SETTLEMENT.md) | **Shipped** (CR-06) |
| Clinic billing / front desk | [CLINIC_BILLING.md](./CLINIC_BILLING.md) · [FRONT_DESK.md](./FRONT_DESK.md) | **Shipped** |
| Audit of money events | [AUDIT_BILLING.md](./AUDIT_BILLING.md) | **Shipped** (SC-07) |
| Commercial config | [COMMERCIAL_CONFIG.md](./COMMERCIAL_CONFIG.md) | **Shipped** (PA-02) |

**Hard rule:** Kiorly does **not** submit e-receipts or e-invoices to ETA. Clinics issue their own.
