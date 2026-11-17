# Kiorly SaaS invoices (SB-01)

Separate from clinic **patient** `Invoice` / `InvoiceLine` (front office + ETA). Models live under `billing-platform` (organization context).

## Data model

| Model | Purpose |
|-------|---------|
| `KiorlyInvoice` | Tenant SaaS bill: status lifecycle, totals, `periodKey` unique per tenant |
| `KiorlyInvoiceLine` | Typed lines (`KiorlyLineType`) with EN/AR descriptions |
| `KiorlyInvoiceNumberSequence` | Gapless per-market yearly counter → `KIO-EG-2027-000123` |

Statuses: `DRAFT`, `ISSUED`, `PAID`, `PARTIALLY_PAID`, `VOID`, `UNCOLLECTIBLE`.

- **Issue** sets `dueAt` = `issuedAt` + N days (`market.featureDefaults.kiorlyBilling.invoiceDueDays`, default **7**).
- **Void** only via issuing a **credit memo** invoice (`creditMemo`, `voidOfInvoiceId`); original → `VOID`. Issued invoice lines are never edited.

## API

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/v1/billing/invoices` | Tenant JWT | Paged list |
| `GET /api/v1/billing/invoices/:id` | Tenant JWT | JSON detail |
| `GET /api/v1/billing/invoices/:id?format=pdf` | Tenant JWT | Minimal built-in PDF |
| `POST /api/v1/billing/invoices/:id/pay` | Tenant JWT | Record payment (`?amount=` optional) |

Service helpers (`KiorlyInvoicesService`): `createDraft`, `issue`, `voidViaCreditInvoice`, `replaceDraftLines` (draft only).

## Web

Organization → **Plan & billing** — Kiorly invoices table, status chips, Pay + PDF links.

## Migration

`20261117305000_sb01_kiorly_invoices`

## Tests

- `sb01-kiorly-invoice.node.test.ts` — issued-line guard + number format
- `sb01-kiorly-invoice.integration.test.ts` — gapless concurrent numbering, issued line mutation rejected

## SB-02 payments

- See **[KIORLY_PAYMENTS.md](./KIORLY_PAYMENTS.md)** — gateways, webhooks, auto-charge, pay modal.

## CR-06 settlement

- See **[MONTHLY_SETTLEMENT.md](./MONTHLY_SETTLEMENT.md)** — `settlePeriod`, preview API, Cairo scheduler, higher-of explanation on invoice detail.

## Follow-ups
- Kiorly ETA e-invoice when SaaS fiscal rules apply (`etaUuid`)
- Auto-apply `CreditWallet` at draft build time