# No tax-authority reporting

> **Founder decision, reaffirmed 19 Nov 2026 (ADR-011, KX-01, FD-02).** No product in the Kiorex ecosystem integrates
> with, submits to, or reports to any tax authority, in any market. **Clinics, doctors, pharmacies and labs are
> independent businesses that file their own taxes with their own systems.**

## What Kiorly does

- Shows a **configurable VAT line** on invoices and on printed payment records. The rate comes from plain config: the
  clinic's `invoiceVatPercent` and the market pack `taxConfig` (see [CLINIC_TAX_AND_LICENSING.md](./CLINIC_TAX_AND_LICENSING.md),
  [FD-00_MARKET_TAX_DEFAULTS.md](./FD-00_MARKET_TAX_DEFAULTS.md)); the arithmetic is `common/vat-breakdown.ts`.
- Prints the clinic's own **tax registration number** (a label and a value, so the clinic's own paperwork is complete).
- Shows VAT on **Kiorly's own SaaS invoices** (market pack `saasVatPercent`).
- **Exports data** (CSV / PDF / xlsx: revenue, invoices, reports, tenant export) so a business can hand it to its accountant.

## What Kiorly must never do

- Call any tax-authority API (Egyptian ETA e-invoicing / e-receipt, ZATCA, FTA, or anything similar).
- Hold signing certificates or e-seals, submit UUIDs, queue or resubmit receipts, or integrate a fiscal device or POS chain.
- Show a "tax compliance status" screen or imply that Kiorly files anything for the clinic.
- Send patient or buyer details to a tax authority.

Do not add these, do not stub them, do not plan them. The `eta_receipts` entitlement and the fiscal queue were removed
in FD-02 ([FD-02_ETA_RETIRED.md](./FD-02_ETA_RETIRED.md)); the old fiscal tables are retained read-only so historic invoices still open.

## How it is enforced

`apps/api/src/compliance/no-tax-authority.node.test.ts` scans the runtime code of the API, the web app and `scripts/` and
**fails on any reference** to: ETA, e-invoice / e-receipt, ZATCA / FTA / Fatoora, tax-authority hosts, UUID submission
(`referenceOldUUID`, `etaUuid`), fiscal queues / devices / documents / submissions, or "tax compliance status".
It also checks that VAT code opens no outbound HTTP connection and that this page is linked from the Docs hub and the
help centre. The few justified legacy references (read-only guards over retained tables) are listed in the test's
allow-list with a reason; the list may only shrink. The older `fd02-no-eta-outbound.node.test.ts` guards ETA hosts and workers.

## What clinics and doctors are told

> Kiorly prints your payment records and invoices with your configured VAT line and exports CSV/PDF for your accountant.
> It never reports to a tax authority. You and your accountant file your own taxes with your own systems.

This sentence is in the help centre ("How do I download operations or Kiorex reports?", EN + AR) and in the in-app Guide.

## Open item

The versioned **privacy notice** (`apps/api/src/legal/legal-pack-content.ts`) still contains a sentence saying buyer names
on large receipts may be sent to the Egyptian Tax Authority. That contradicts this decision. Legal wording needs a human:
see NH-024 in [KIORLY_NEEDS_HUMAN.md](./KIORLY_NEEDS_HUMAN.md).
