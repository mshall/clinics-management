# Product epic roadmap (beyond current sprint)

**Capability matrix:** [CLINIC_PLATFORM_CAPABILITIES.md](./CLINIC_PLATFORM_CAPABILITIES.md)

**Egypt go-live:** [EGYPT_GO_LIVE.md](./EGYPT_GO_LIVE.md) · **Compliance mapping:** [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md)

## Insurance & revenue cycle

- Eligibility verification (payer / network)
- Pre-authorization workflows
- **Egypt:** Company and TPA medical claims (not eClaimLink)
- Payment matching (remittance ↔ invoice)

## Commission & cash

- Commission rules engine (tiers, splits, packages)
- Front-desk cash drawer (open/close shift) — **foundation shipped**

## Clinical operations

- Lab and radiology **orders as first-class records**
- Referrals to / from external providers
- Doctor sign-off on notes; co-sign for trainees
- Clinical incidents + quality measures (**GAHAR** alignment)

## Specialty modules

- Dentistry: odontogram
- Aesthetics: before/after with consent
- Physio: treatment-plan series

## Scheduling engine

- Per-doctor availability templates
- Appointment types (duration, buffers, rooms)
- Branch timezone; online booking + waitlists
- **WhatsApp reminders** — async queue (org-configurable hours before appointment)

## Billing extensions

- Refunds, credit notes, deposits, prepaid packages

## AI layer

- Ambient scribe (AR / EN)
- Suggested DX + local coding
- No-show prediction
- **WhatsApp assistant (Egyptian Arabic)** for booking
- Pre-visit summary; role-aware assistant

## Implementation note

Each epic lands as migration + API + nav + smoke coverage before production claims.