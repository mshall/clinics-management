# AI-03 — Honest AI labels

| Item | Status |
|------|--------|
| AI-03 Marketing + in-app copy matches backing | **Done** |

## Rule

- **AI badge** (`aiFeatures.badge`) only on **model-backed** features today: **Kiorly AI assistant** (`role_assistant`).
- **Rule-based** features use **Smart summary** / **risk estimate** wording — no “AI” in titles: pre-visit summary, no-show score.
- **Chart scribe** is a **workflow** (review → approve); ambient speech and generative drafts are not production AI yet.

## Where copy lives

| Surface | Keys |
|---------|------|
| Patient chart pre-visit card | `aiFeatures.preVisitSummary.*` |
| Signup / marketing step | `signup.capabilityBullets.*` |
| Role guide book | `GUIDE_HONEST_AI_EN` + Arabic bodies in `role-guide-content.ts` |
| Floating assistant | `assistant.*` + AI badge in `role-assistant-widget.tsx` |

Registry: `apps/web/src/lib/ai-feature-disclosure.ts`

## No-show risk chip (FS-05)

| Item | Status |
|---|---|
| FS-05 Low / medium / high chip on appointment list rows, calendar cards and the appointment page (Pro+, `mod_front_desk`) | **Done** |
| FS-05 Label says **rule-based** until a trained model ships | **Done** (tested EN + AR) |
| FS-05 Nightly refresh + deposit / extra-reminder suggestion for high risk | **Done** |

- API: `AppointmentDto.noShowRisk` = `{ score, band, method, factors, priorNoShows, suggestion }` for upcoming `SCHEDULED` / `CONFIRMED` bookings, computed by `apps/api/src/common/no-show-risk.ts` (same formula as before: 18 points per previous no-show up to 85, +12 deposit flag, +8 if it starts within 4 h; clamped 5–99). Bands: low < 30 ≤ medium < 60 ≤ high. `method` is the constant `RULE_BASED`; the web shows "rule-based" next to the band whenever `method === "RULE_BASED"`, so the label can only change when the API reports a different method.
- Chip text: e.g. **High no-show risk · rule-based** / **احتمال تغيّب مرتفع · تقدير بالقواعد**; tooltip (and, on the appointment page, a visible note for tablets/phones) explains "Rule-based estimate from a fixed formula — not a trained prediction model" and which factors applied.
- Suggestion (high risk only): **deposit** when the plan has `deposits` and the patient is not already deposit-flagged, otherwise **extra reminder**.
- Nightly: `NoShowRiskScheduler` at 01:00 UTC stores `Appointment.noShowRiskScore` for Pro+ tenants (only changed rows are written). Manual refresh stays at `POST /clinic-ai/appointments/refresh-no-show-risk`.
- Tests: `apps/api/src/common/fs05-no-show-risk.node.test.ts`, `apps/api/src/clinic-ai/fs05-no-show-risk.integration.test.ts`, `apps/web/src/lib/fs05-no-show-risk.node.test.ts`, `apps/web/e2e/fs05-no-show-risk.spec.ts`.

## Tests

- `apps/web/src/lib/ai-feature-disclosure.node.test.ts` — en/ar parity, no false AI on rule features, guide + signup alignment

## Follow-ups

- Flip `chart_scribe` to `model` + AI badge when speech + generative provider ships.
- External marketing site (if split from signup) should import the same `aiFeatures` strings.