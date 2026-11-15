# AI assistant — architecture

The floating assistant is available to all organization roles (plus platform super admin). It never bypasses **navigation tab permissions** — the same keys as the web sidebar (`allowedNavKeys`).

## Response pipeline (in order)

1. **Scope check** — topics map to required tabs; refuse if none match.
2. **Live data** — clinics, headcount, revenue/expenses (with period), patient counts; uses the same services as REST APIs.
2a. **Scoped database reads** — `AssistantScopedQueriesService` runs Prisma queries filtered by role and clinic scope (same rules as the dashboard and patient list). Examples: **today’s live ops** (appointments, waiting, collected today) when the user has **Appointments** or **Dashboard**; **encounter counts** for a period when they have **Encounters** (physicians only see their own encounters). Results are injected into direct replies and the OpenAI snapshot JSON — the model does not get raw SQL or unrestricted table access.
2b. **Per-clinic revenue** — when the question asks for revenue **by clinic** / across the org, returns a posted-revenue breakdown per clinic (same rules as `GET /revenue/clinic-breakdown`) before aggregate totals.
3. **Patient lookup** — search with chart **action buttons** (`/patients/:id`); name phrases such as *“look for a patient named …”* strip filler words; patient list search uses **contains** on first/last name (including combined first + last).
4. **Playbook** — how-to steps + **navigate** buttons (`/hr`, `/appointments`, …).
5. **AiProvider** (optional) — chat completions via market-configured endpoint (`openai-compatible`); versioned prompt templates in `apps/api/src/assistant/prompts/v1/`.
6. **Rule-based FAQ** — `QA_ENTRIES` + module guidance fallback.

## Extending coverage

| Goal | Edit |
|------|------|
| New how-to + button | `assistant-playbook-entries.ts` or `assistant-playbook.ts` |
| Conceptual FAQ | `assistant-qa-extended.ts` |
| Role tone in LLM | `assistant/prompts/v1/role-hints.json` |
| Prompt copy / tuning | `assistant/prompts/v1/system.*.template.md` |
| Market model & base URL | `Market.providerConfig.ai` (platform admin / DB) |
| New live metric | `assistant-live-data.service.ts` + `assistant-intent.ts` |
| New scoped DB query | `assistant-scoped-queries.service.ts` (enforce clinic/role filters) + intent + snapshot |
| New nav area | `assistant-nav-routes.ts` + `NAV_GUIDANCE` in `assistant-knowledge.ts` |

## Actions

- `navigate` — in-app route the user is allowed to see.
- `open_patient` — patient chart deep link.

The assistant does **not** mutate data server-side; it guides and navigates.

## Rich chat UI (web)

Assistant replies use lightweight markdown rendered in the widget:

- `##` section titles, `>` callouts, `-` bullets, numbered steps, `**bold**` for key numbers
- Revenue lines can render as **metric cards** (currency, net, gross)
- OpenAI system prompt and direct-data handlers emit the same conventions so rule-based and LLM answers look consistent

## AiProvider (no direct vendor SDK in app code)

All LLM calls go through `AiRuntimeService` → `AiProvider` (`providers/ai/`). Each **market** sets `providerConfig.ai`:

| Field | Meaning |
|-------|---------|
| `key` | Provider implementation (`openai-compatible`) |
| `baseUrl` | Chat API root (e.g. `https://api.openai.com/v1` or on-prem OpenAI shim) |
| `model` | Model id |
| `secretRef` | Secrets Manager ARN or `env:OPENAI_API_KEY` for local dev |
| `promptVersion` | Folder under `assistant/prompts/` (default `v1`) |

Supported API surface: **chat completions** and optional **function tools** — not Assistants, built-in file search, or vendor-specific structured-output modes.

Feature flag: `ai_assistant` (platform / market / org layers). **All three layers must allow** the flag for the assistant widget and chat API to work.

| Layer | Web UI | API |
|-------|--------|-----|
| Platform (global master) | Platform → Overview → Global feature flags | `PATCH /admin/platform/feature-flags/ai_assistant` |
| Country (market) | Platform → Market launch → Flags on a country | `PATCH /admin/platform/markets/:id/feature-flags/ai_assistant` |
| Organization | Admin → Organization → Organization feature flags | `PATCH /admin/tenant-feature-flags/ai_assistant` |

When disabled at any layer, `GET /assistant/context` returns `assistantEnabled: false` and `POST /assistant/chat` responds with **403**.

Full flag semantics and keys: [FEATURE_FLAGS.md](./FEATURE_FLAGS.md).

Credentials setup: [ASSISTANT_OPENAI_SETUP.md](./ASSISTANT_OPENAI_SETUP.md) (rename path stays; content describes secret ref wiring).
