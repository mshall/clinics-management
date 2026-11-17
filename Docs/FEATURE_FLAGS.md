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
2. If **plan** does not entitle the capability (`eta_receipts`, `ai_assistant` only — see `PLAN_GATED_FEATURE_FLAGS`) → **off**.
3. If **market** is explicitly off → **off**.
4. If **org** is explicitly off → **off**.
5. If **org** is explicitly on → **on** (subject to global, plan, and market not blocking).
6. Else if **market** is explicitly on → **on**.
7. Else fall back to market `featureDefaults` JSON (legacy camelCase keys) when present; otherwise conservative defaults.

Plan entitlements come from `EntitlementsService.resolve` (plan catalog + `TenantEntitlementOverride`, trial plan while `TRIALING`). Paid API surfaces use `@RequiresEntitlement` → HTTP **402** `{ code: "PLAN_UPGRADE_REQUIRED", entitlement, requiredPlan }`.

**PL-04:** Feature-flag keys `eta_receipts`, `ai_assistant`, `whatsapp_reminders`, `card_payments`, `instapay`, and `fawry` map to plan entitlement keys in `plans-matrix.ts` (`FEATURE_FLAG_ENTITLEMENT`). Module controllers are gated per [PLANS_AND_ENTITLEMENTS.md](./PLANS_AND_ENTITLEMENTS.md).

Payment and compliance code paths call `isEnabled(tenantId, key)`. The assistant uses `isEnabledForUser(tenantId, "ai_assistant")` so platform-only users without a tenant respect the global master switch only.

**Organization payment channels** (custom transfer rails) are **not** feature-flag keys — group admins configure them on **Administration → Organization & settings → Payment channels** (`TenantPaymentChannel`). Market flags `instapay` / `fawry` / `card_payments` still control built-in methods; see [MULTI_MARKET.md](./MULTI_MARKET.md).

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