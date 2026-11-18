# Monthly statement for clinics (CR-11)

| Item | Status |
|------|--------|
| CR-11 Monthly statement — JSON + bilingual PDF + Plan & billing list | **Done** |
| Statement delivery on invoice issue (email + WhatsApp via outbox) | **Enqueued** — sender for `billing.*` INTERNAL topics is a follow-up |

## Purpose

Owners see exactly **why they paid what they paid** for each calendar month. The statement is derived from the persisted `KiorlyInvoice` (lines, totals, `settlementSummaryJson`), billed `KiorexCommissionCharge` rows and `KiorlyPayment` rows — no separate model, so it can never drift from the invoice.

## Contents (per period)

| Block | Source |
|-------|--------|
| Subscription (plan, extra seats, add-ons, usage) | `SUBSCRIPTION` / `SEAT` / `ADDON` / `USAGE_OVERAGE` lines |
| Kiorex patients — date, doctor, patient initials, fee | `KIOREX_COMMISSION` lines (`refId` = charge) → charge `attendedAt`, clinician `displayName`, patient initials; fee = billed line amount (after Lite cap scaling) |
| Commission total | Σ commission lines (carry-forward line shown separately) |
| Offset | `KIOREX_COMMISSION_OFFSET` (higher-of, never both) |
| Prepaid | `PREPAID` lines |
| Credits used | `KiorlyInvoice.creditsApplied` |
| Wallet balance | `CreditWallet.balance` at read time |
| Net payable | subtotal − credits used |
| VAT | `KiorlyInvoice.tax` (rate from the market pack `kiorlyBilling.taxRatePercent`; derived from the invoice when issued) |
| Payments | `KiorlyPayment` rows for the invoice, paid and due |
| Explanation EN/AR | `settlementSummaryJson` |

`reconciles: true` means the statement components add up to the persisted invoice `subtotal` and `total`. Periods without an invoice return a **dry-run preview** (`preview: true`) from `SettlementService.settlePeriod({ dryRun: true })`.

## API

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/billing/statements` | Invoiced periods for the caller's organization (credit memos excluded) |
| `GET /api/v1/billing/statements/:period` | `period` = `YYYY-MM`; JSON statement |
| `GET /api/v1/billing/statements/:period?format=pdf` | Bilingual PDF: English page(s) then Arabic (RTL) page(s) |

Tenant-scoped like `GET /billing/invoices` (platform super admins may read any tenant through the service). Entitlement policy: **open** (`plans-matrix.ts`).

## PDF

`bilingual-pdf.ts` — dependency-free PDF 1.4 writer:

- Latin text in built-in Helvetica (WinAnsi).
- Arabic shaped to presentation forms (joining + lam-alef ligatures), simplified bidi (numbers stay LTR, brackets mirrored), drawn with embedded **Noto Naskh Arabic** (`apps/api/assets/fonts`, SIL OFL 1.1, Identity-H CID font).
- `apps/api/Dockerfile` copies `apps/api/assets` into the runtime image.

## Delivery on issue

`KiorlyInvoicesService.issue()` writes, in the same transaction as the status change and audit row, one `OutboxEvent` per channel:

- `type`: `billing.monthly_statement_ready`, `target`: `INTERNAL`, `aggregateType`: `KiorlyInvoice`
- payload: `channel` (`email` → owner email, `WHATSAPP` → owner employee phone when present), invoice number, period, total, currency, `statementPath`, `locales: ["en","ar"]`
- No PHI (no patient names or initials) in the payload — the recipient downloads the PDF from `statementPath`.

## Invoice totals fix (shipped with CR-11)

`KiorlyInvoicesService.computeTotals` now excludes display-only `TAX` lines from `subtotal` and rounds VAT half-up to 2 decimals; settlement re-runs pass the new `creditsApplied` and tax rate to `replaceDraftLines`. Before this, a market with VAT > 0 double-counted VAT on settlement invoices (CR-06 case EC-07 now reconciles end-to-end).

## UI

Admin → Organization → **Plan & billing**: `AdminKiorlyStatementsPanel` (list, detail dialog, PDF button). Strings under `admin.billing.statements.*` in `en.json` + `ar.json`.

## Tests

- `cr11-monthly-statement.node.test.ts` — statement totals = invoice totals for **every CR-06 case** (§04-1…9, EC-01…09); components; Arabic shaping/bidi; PDF structure (2 pages, embedded font round-trips).
- `cr11-monthly-statement.integration.test.ts` — every CR-06 case persisted via `createDraft` → statement totals = `KiorlyInvoice` totals; settled period patient list (date, doctor, initials, fee); issue enqueues email + WhatsApp outbox rows without PHI; PDF + list + tenant isolation; preview for un-invoiced period.

## Follow-ups

- Outbox consumer for INTERNAL `billing.*` topics (send email + WhatsApp template with the PDF link).
- PDF `ToUnicode` CMap for Arabic copy/search; font subsetting to shrink the PDF (~95 KB today).
