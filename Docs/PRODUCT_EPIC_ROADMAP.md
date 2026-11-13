# Product epic roadmap (beyond current sprint)

This document tracks large epics from the clinic platform backlog. **Shipped in the latest sprint** (see git history): HR add-employee UX (clinic placement, group physician, specialty, commission), clinic specialty on create, Material Light default theme, tax invoices (TRN + VAT breakdown), and foundation enums for clinical specialties.

## Insurance & revenue cycle

- Eligibility verification (payer / network)
- Pre-authorization workflows
- eClaimLink (UAE) submission and status
- Payment matching (ERA / remittance ↔ invoice)

## Commission & cash

- Commission rules engine (tiers, splits, packages)
- Front-desk cash drawer (open/close shift, cash vs card reconciliation)

## Clinical operations

- Lab and radiology **orders as first-class records** (not upload-only)
- Referrals to / from external providers
- Doctor sign-off on notes; co-sign for trainees
- Clinical incidents + quality measures (DHA / JCI)

## Specialty modules (by `ClinicalSpecialty`)

- Dentistry: odontogram / tooth chart
- Aesthetics: before/after with consent
- Physio: treatment-plan series

## Scheduling engine

- Per-doctor availability templates
- Appointment types (duration, buffers, rooms, equipment)
- Branch timezone; mapping to appointments
- Online booking + waitlists

## Billing extensions

- Refunds, credit notes, deposits, prepaid packages / memberships

## AI layer

- Ambient scribe (AR / EN), note draft + physician sign-off
- Suggested DX/CPT (or local codes) + pre-submission claim checks
- No-show prediction, smart overbooking, reminders
- WhatsApp assistant (Gulf Arabic) for booking
- Pre-visit patient summary; future health-network data
- Role-aware in-app AI assistant (EN / AR)

## Implementation note

Each epic above should land as its own migration slice, API module, nav entry, and integration-smoke coverage before claiming production readiness.
