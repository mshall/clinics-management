# FD-02 — ETA receipts retired from Kiorly

| Item | Status |
|------|--------|
| Launch build Step 003 | **In progress** on `kiorly/launch` |

## Product rule

Clinics issue their own ETA e-receipts and e-invoices. Kiorly does **not** submit to ETA (`KIORLY_ETA_SUBMISSION_ENABLED` defaults off; `queueFiscalDocument` no-ops).

## Shipped in FD-02 branch

- `postRevenue` — single money path without fiscal queue (`post-revenue.ts`).
- Clinic create — no virtual `FiscalDevice` provisioning.
- Web — `useOrgEtaIntegration` hides ETA UI (`showEtaUi: false`).
- Tests: `revenue-single-path.node.test.ts`, `fd02-no-eta-submission.node.test.ts`.
- Historic `FiscalDocument` / `FiscalDevice` rows remain read-only.

## Archived

- [ETA_RECEIPT_V12.md](./archive/ETA_RECEIPT_V12.md) (moved from root `Docs/`)

## Needs human

Company tax on Kiorly SaaS invoices — outside the product (see `KIORLY_NEEDS_HUMAN.md`).