# AI assistant — architecture

The floating assistant is available to all organization roles (plus platform super admin). It never bypasses **navigation tab permissions** — the same keys as the web sidebar (`allowedNavKeys`).

## Response pipeline (in order)

1. **Scope check** — topics map to required tabs; refuse if none match.
2. **Live data** — clinics, headcount, revenue/expenses (with period), patient counts; uses the same services as REST APIs.
3. **Patient lookup** — search with chart **action buttons** (`/patients/:id`).
4. **Playbook** — how-to steps + **navigate** buttons (`/hr`, `/appointments`, …).
5. **OpenAI** (optional) — mature system prompt with role hints, playbook, and live JSON snapshot.
6. **Rule-based FAQ** — `QA_ENTRIES` + module guidance fallback.

## Extending coverage

| Goal | Edit |
|------|------|
| New how-to + button | `assistant-playbook-entries.ts` or `assistant-playbook.ts` |
| Conceptual FAQ | `assistant-qa-extended.ts` |
| Role tone in LLM | `assistant-role-hints.ts` |
| New live metric | `assistant-live-data.service.ts` + `assistant-intent.ts` |
| New nav area | `assistant-nav-routes.ts` + `NAV_GUIDANCE` in `assistant-knowledge.ts` |

## Actions

- `navigate` — in-app route the user is allowed to see.
- `open_patient` — patient chart deep link.

The assistant does **not** mutate data server-side; it guides and navigates.

## OpenAI

See [ASSISTANT_OPENAI_SETUP.md](./ASSISTANT_OPENAI_SETUP.md). Production key: AWS Secrets Manager only.
