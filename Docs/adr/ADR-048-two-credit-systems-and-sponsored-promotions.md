# ADR-048: Two separate credit systems and provider-sponsored promotions

- Status: **PROPOSED** (founder-approved design of 24 Nov 2026, not signed). Needs counsel for the patient CREDIT mode and accounting for sponsored discounts (launch guide 11.24 to 11.31).
- Canonical text: `_docs/rev23/KX-01_Decision_Log_ADRs.md` (ADR048). This is the repository copy, kept short. Refines ADR-046, extends ADR-007 and ADR-041.

## Context
Growth needs rewards, service recovery and a refund option for patients, and a way for providers to offset Kiorex fees and to fund their own patient discounts. A general-purpose wallet would be a regulated stored-value product, would invite arbitrage between patients and providers and would mix patients' money with providers' credit.

## Decision
1. **Two separate credit systems.** Patient credit (Kiorex, closed loop, spendable on Kiorex bookings only) and provider credit (Kiorly, the CR-05 wallet). Separate ledgers, tables, services and repositories; no conversion, no shared balance row, no cross-ledger entry; no import between repositories (guard test S10). Neither is a money wallet: no top-up, transfer or cash-out.
2. **Patient credit** comes from verified qualifying events (completed visits), goodwill grants with a second approver, refund credit and campaign credit, always with expiry, caps and scope. At refund time the patient chooses the original payment method (preselected) or "keep as credit". COUPON mode is the default; CREDIT mode is launch-locked and counsel-gated. Never Kiorex revenue.
3. **Provider credit** pays Kiorex fees first (credit before the invoice), carries waivers, dispute-win returns, onboarding and connect credit; never patients' money.
4. **Provider-sponsored promotions** are discounts the provider funds, never a conversion: configured in the Clinic, reserved at booking, debited at completion, released or reversed on cancel and refund; commission basis is the fee before the sponsored discount unless the versioned `SPONSORED_PROMOTION_POLICY` says otherwise; a promotion never changes chargeability or attribution.

## Consequences
Two ledger implementations proved against shared vectors (`fixtures/credit-ledger-vectors.json`, invariants RC-1 to RC-7 and W-1 to W-8), launch-locked flags, contracts 1.12.0 additive fields. Open: maximum open balance, refund-credit expiry behaviour, order of use, high-value thresholds (Q22).

## As built in this repository (25 Nov 2026)
Provider credit (P2-W, `apps/api/src/credits`: categories, append-only ledger, idempotency, fee draw-down, dispute-win credit, promotion holds) is built and tested locally; patient credit lives in Kiorex only and nothing here imports it; sponsored promotions (P2-S) are built by the wave 7 lane A2 (see its as-built record); nothing is deployed and every launch-locked flag stays locked.
