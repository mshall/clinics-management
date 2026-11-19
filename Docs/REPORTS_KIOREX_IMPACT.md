# Kiorex impact report (RP-03)

`GET /api/v1/reports/kiorex?period=YYYY-MM`

| Field | Source |
|-------|--------|
| Bookings / attended / new patients | Kiorex booking sources (marketplace, WhatsApp, clinic link) |
| Visit revenue | Posted revenue on those new-patient appointments |
| Commission | Confirmed/BILLED Kiorex commission charges |
| Offset | CR-11 / settlement `offsetAmount` (higher-of) |
| Net cost / new patient | `(commission − offset) / newPatients` |

Acceptance: `matchesStatement` when confirmed commission and offset equal the monthly statement (CR-11). Monthly WhatsApp recap remains MS-04 / digests.

Entitlement: `mod_revenue` (all tiers). UI: Reports → Kiorex impact card.

Tests: `rp03-kiorex-impact.node.test.ts`, `rp03-kiorex-impact.integration.test.ts`.
