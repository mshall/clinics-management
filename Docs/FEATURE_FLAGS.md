# Feature flags (platform · market · organization)

Product capabilities such as **AI assistant**, **ETA fiscal receipts**, **WhatsApp reminders**, and **payment channels** (InstaPay, Fawry, card) are gated by **layered feature flags**. No code deploy is required to turn a capability on or off at the right scope.

**Canonical keys** (see `apps/api/src/feature-flags/feature-flag-keys.ts`):

| Key | Purpose |
|-----|---------|
| `ai_assistant` | Floating role assistant + `POST /assistant/chat` (market **AiProvider** for LLM) |
| `eta_receipts` | Fiscal document queue and ETA submit |
| `whatsapp_reminders` | Scheduled appointment WhatsApp reminders |
| `instapay` | InstaPay transfer collection |
| `fawry` | Fawry transfer collection |
| `card_payments` | Card allocation at cashier |

---

## Three layers

| Layer | Who edits | Web UI | API |
|-------|-----------|--------|-----|
| **Platform (global)** | Platform super admin | Platform → **Overview** → Global feature flags | `GET/PATCH /api/v1/admin/platform/feature-flags/:key` |
| **Market (country)** | Platform super admin | Platform → **Market launch** → **Flags** on a live market | `GET/PATCH /api/v1/admin/platform/markets/:id/feature-flags/:key` |
| **Organization (tenant)** | Group admin (org) | Admin → **Organization & settings** → Organization feature flags | `PATCH /api/v1/admin/tenant-feature-flags/:key` |

Org admins see **Platform · Market** status on each row; toggles set an explicit org override (`TenantFeatureFlag`).

---

## Effective value

For a signed-in user in a tenant, `FeatureFlagsService` computes **effective** per key:

1. If **global** is off → **off**.
2. If **market** is explicitly off → **off**.
3. If **org** is explicitly off → **off**.
4. If **org** is explicitly on → **on** (subject to global and market not being off).
5. Else if **market** is explicitly on → **on**.
6. Else fall back to market `featureDefaults` JSON (legacy camelCase keys) when present; otherwise conservative defaults.

Payment and compliance code paths call `isEnabled(tenantId, key)`. The assistant uses `isEnabledForUser(tenantId, "ai_assistant")` so platform-only users without a tenant respect the global master switch only.

---

## AI assistant (`ai_assistant`)

All three layers must allow the flag for end users in an organization:

- **Widget** — `GET /assistant/context` returns `assistantEnabled: false` when off; the floating button is hidden.
- **Chat** — `POST /assistant/chat` returns **403** when off.
- **LLM** — `AiRuntimeService` skips provider calls when the flag is off (rule-based / live-data replies may still apply where implemented).

Configure the LLM separately per market via `Market.providerConfig.ai` — see [ASSISTANT.md](./ASSISTANT.md) and [ASSISTANT_OPENAI_SETUP.md](./ASSISTANT_OPENAI_SETUP.md).

**Operations checklist**

| Goal | Action |
|------|--------|
| Disable assistant worldwide | Platform → Overview → turn off **AI assistant** |
| Disable for Egypt only | Platform → Market launch → Egypt → **Flags** → off **AI assistant** |
| Disable for one clinic group | Admin → Organization → off **AI assistant** (other orgs in the same country unaffected) |
| Enable after pilot | Reverse the layer you turned off; ensure market **AiProvider** `secretRef` is set for LLM replies |

---

## Related

- [ASSISTANT.md](./ASSISTANT.md) — assistant pipeline and prompts  
- [MARKET_GO_LIVE_TEMPLATE.md](./MARKET_GO_LIVE_TEMPLATE.md) — market launch checklist  
- RFC §5.2 — markets and providers  
- PRD §6.6.0 — platform super administration  