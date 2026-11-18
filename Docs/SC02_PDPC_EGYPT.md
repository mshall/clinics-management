# SC-02 — PDPC licences, DPO, privacy notice (Egypt)

| Item | Status |
|------|--------|
| DPO appointment + PDPC registration (business) | **Partial** — registry placeholders |
| Controller / processor / cross-border filings | **Partial** — update `platform/pdpc-egypt-filings.json` when in hand |
| Arabic patient privacy notice (GT-02) | **Done** — `patient_privacy_notice` |
| Records of processing (ROPA) | **Done** — [RECORDS_OF_PROCESSING_EG.md](./RECORDS_OF_PROCESSING_EG.md) |
| Breach procedure (72h PDPC / 3d subjects) | **Done** — [runbooks/PDPC_DATA_BREACH.md](./runbooks/PDPC_DATA_BREACH.md) |
| Paid launch gate (EG) | **Done** — `PDPC_EGYPT_LAUNCH_GATE` until filings filed |

Depends on **SC-01** (Frankfurt cell + cross-border narrative).

## Business checklist

1. Appoint DPO (contract); register with PDPC — set `dpo.*` in `platform/pdpc-egypt-filings.json`.
2. Apply for **controller** and **processor** licences; file **cross-border transfer** approval (Path A).
3. Mark each filing `filed` or `approved` with `reference` and `filedAt` in the JSON registry.
4. Clinic counsel reviews privacy notice; bump `LEGAL_PACK_VERSION` when text changes.

## Engineering

| Piece | Location |
|-------|----------|
| Filing registry | `platform/pdpc-egypt-filings.json` |
| Gate helpers | `apps/api/src/compliance/pdpc-egypt-filings.ts`, `pdpc-egypt-launch-gate.ts` |
| Paid activation | `SubscriptionService.activateSubscription`, paid `changePlan` |
| Bypass (dev/staging) | `PDPC_EGYPT_LAUNCH_GATE_BYPASS=1` |
| Tests | `sc02-pdpc-egypt.node.test.ts` |

## UI

- Signup legal step + footer link → `/legal/patient_privacy_notice`
- Public appointment reschedule → privacy link
- Patient chart (staff) → existing privacy link

## Follow-ups

- Upload PDPC licence PDFs to secure evidence store (not git).
- Platform admin UI to read filing status (today: JSON + docs).
- Per-clinic DPO fields on tenant settings.