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

## Tests

- `apps/web/src/lib/ai-feature-disclosure.node.test.ts` — en/ar parity, no false AI on rule features, guide + signup alignment

## Follow-ups

- Show no-show **risk estimate** on appointment UI when `noShowRiskScore` is exposed in appointment DTOs.
- Flip `chart_scribe` to `model` + AI badge when speech + generative provider ships.
- External marketing site (if split from signup) should import the same `aiFeatures` strings.