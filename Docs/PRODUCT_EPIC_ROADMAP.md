# Product epic roadmap

**Capability matrix:** [CLINIC_PLATFORM_CAPABILITIES.md](./CLINIC_PLATFORM_CAPABILITIES.md)  
**Launch sequence:** [kiorly-cursor-build-sequence.md](./kiorly-cursor-build-sequence.md) (§5)  
**Hubs (GT-06):** [PLANS_AND_ENTITLEMENTS.md](./PLANS_AND_ENTITLEMENTS.md) · [BILLING_AND_CREDITS.md](./BILLING_AND_CREDITS.md) · [KIOREX_CONNECTOR.md](./KIOREX_CONNECTOR.md)

## Launch (shipped on `kiorly/launch`)

- Plans, entitlements, credits, SaaS invoices/payments, dunning, settlement
- Kiorex marketplace, commissions, deposits, waitlist, no-show risk
- Clinical SOAP/Rx safety, specialties templates (CL-04), AI scribe pilot
- Front desk cash drawer, split pay, installments, revenue share
- Messaging (WhatsApp + email), digests, support ops + help centre
- Security: Frankfurt residency, MFA, exports, rate limits, WAF intent
- Go-to-market: marketing site, legal pack, sales kit, docs hubs

## Phase 1b (after public launch — Steps 101–108)

| Epic | Step | Notes |
|------|------|-------|
| No-show guarantee credits | CR-10 | Optional, off by default |
| Consent-based record sharing (patient app) | KX-11 | |
| Lab & radiology orders as records | CL-06 | |
| Specialty packs (dental / aesthetics / physio) | CL-07 | |
| Company contracts & TPA claims | MN-05 | Egypt medical claims (not eClaimLink) |
| WhatsApp AI receptionist (Egyptian Arabic) | MS-06 | |
| AR aging, payouts, branch P&L | RP-04 | |
| Thermal printing & accessibility | UX-04 | |

## Longer-term

- Eligibility verification & remittance matching
- Clinical incidents / GAHAR quality measures
- Suggested DX + local coding beyond templates

## Implementation note

Each epic lands as migration + API + nav + smoke coverage before production claims. Every shipped task updates its doc status row in the same change (GT-06).
