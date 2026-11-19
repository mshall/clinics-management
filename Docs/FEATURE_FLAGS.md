# Feature flags (platform · market · organization)

Product capabilities such as **AI assistant**, **ETA fiscal receipts**, **WhatsApp reminders**, and **payment channels** (InstaPay, Fawry, card) are gated by **layered feature flags**. No code deploy is required to turn a capability on or off at the right scope.

> **Kiorex v2 (FF01–FF06).** Kiorex super admin is the authority for flags (ADR-023). Kiorly Clinic evaluates a signed,
> persisted snapshot locally. Spec: `_docs/KX-05` §07–08, `_docs/KX-08` §08–09. Registry:
> `apps/api/src/feature-flags/feature-flag-keys.ts`.

**Canonical keys** — every Kiorly Clinic capability that can be switched off (all default ON; AR/EN copy, class and
dependencies live in code). Scopes: G global · M market · O organization.

| Key | Class | Scopes | Depends on / gate | Enforced in |
|-----|-------|--------|-------------------|-------------|
| `clinic.kiorex_listing` | Module | G M O | kiorex.marketplace | profile controller + listing recompute (PAUSED) |
| `clinic.commission_settlement` | Commercial | G M | clinic.kiorex_listing | commission charge capture (new charges stop) |
| `clinic.kiorly_pay_deposits` | Commercial | G M O | — | deposit-link / deposit-policy controller |
| `whatsapp_reminders` | Integration | G M O | — | reminder schedulers (existing) |
| `clinic.whatsapp_inbound` | Integration | G M O | whatsapp_reminders | inbound reply handler (routes to inbox) |
| `instapay` | Integration | G M O | — | transfer channels at cashier |
| `fawry` | Integration | G M O | — | transfer channels at cashier |
| `card_payments` | Integration | G M O | — | `POST /billing/payments` card allocation |
| `ai_assistant` | AI | G M O | — | assistant chat |
| `clinic.ai_scribe` | AI | G M O | — | scribe start / audio / stop |
| `clinic.whatsapp_ai_receptionist` | Launch-locked | G M O | clinic.whatsapp_inbound · gate: Meta approval + consent copy | receptionist service |
| `clinic.no_show_risk` | AI | G M O | — | no-show-risk refresh |
| `clinic.waitlist_autofill` | Module | G M O | whatsapp_reminders | waitlist autofill offers |
| `clinic.record_share_patient_app` | Module | G M O | kiorex.record_vault | record-share consent writes |
| `clinic.eprescription_handoff` | Module | G M O | pharmacy.module | pending (KCV203) |
| `clinic.lab_order_handoff` | Module | G M O | lab.module | pending (KCV204) |
| `clinic.payers_tpa` | Module | G M O | — | claims: new payers / batches |
| `clinic.specialty_templates.<code>` | Launch-locked | G M | gate: specialty board sign-off (NH010) | form-template list (managed mode only) |
| `clinic.referral_rewards` | Commercial | G M | — | referral attribution at signup |
| `clinic.field_rep_onboarding` | Commercial | G M | — | rep code at public signup |

The five pre-v2 keys (`ai_assistant`, `whatsapp_reminders`, `instapay`, `fawry`, `card_payments`) are unchanged
(`FEATURE_FLAG_KEYS`, plan entitlement mapping, DB rows).

## Kiorex control plane (FF02/FF03/FF06)

- **Resolution (7 rules)**, `feature-flag-resolution.ts`: global → market → org → plan → gate evidence → dependencies → effective.
  Any OFF wins; unset = inherit, root = ON; launch-locked flags are OFF until `gateSatisfied` arrives in the snapshot
  ("ON · awaiting gate" in the UI); external parents (`kiorex.marketplace`, `pharmacy.module`, …) are inherited ON unless the snapshot carries them.
- **Snapshot client** (`kiorex-flag-snapshot.service.ts`): polls `GET {KIOREX_CONTROL_PLANE_URL}/api/v1/control/v1/flags/snapshot?product=kiorly-clinic`
  every 30 s with `If-None-Match` (304 = unchanged), request signed with the marketplace HMAC scheme
  (`X-Kiorex-Product-Key`, `X-Kiorly-Timestamp/Nonce/Signature`; secret never sent), snapshot `signature` verified
  (base64url HMAC over sorted-key JSON). The last-known snapshot is persisted in `KiorexFlagSnapshot` and reloaded at boot
  (**fail-static**: control plane down ⇒ last-known kept; fresh deploy with no snapshot ⇒ code defaults).
- **Push**: `POST /api/v1/feature-flags/kiorex/changed` (`X-Kiorly-Timestamp` seconds, `X-Kiorly-Signature: sha256=hex(HMAC(secret, "<ts>.<rawBody>"))`) → immediate refresh; de-duplicated by event id.
- **Audit (FF06)**: every snapshot version change writes `KiorexFlagAuditEvent` (actor-less diff) and, for org-scope changes,
  an `AuditLog` row `FEATURE_FLAG_SNAPSHOT_CHANGED` on the tenant. **Stale alert**: no successful contact for >10 min raises
  `FLAG_SNAPSHOT_STALE` through `notifyOnCall` (runbook `Docs/runbooks/FLAG_SNAPSHOT_STALE.md`).
- **Env**: `KIOREX_CONTROL_PLANE_URL` (unset ⇒ no polling, pre-v2 local layers apply), `KIOREX_FLAGS_PRODUCT_KEY`
  (dev `ff_kiorly-clinic_dev`), `KIOREX_FLAGS_SECRET` (dev `ff_dev_secret_change_me`; required in production),
  `KIOREX_FLAGS_WEBHOOK_SECRET` (falls back to the flags secret), `KIOREX_FLAGS_POLL_MS`, `KIOREX_FLAGS_STALE_ALERT_MS`.
- **Managed mode** (control plane configured or a snapshot exists): platform/market flag pages are **read-only mirrors**
  ("Managed in Kiorex super admin" banner, AR/EN); `PATCH` on global/market returns `409 FLAG_MANAGED_BY_KIOREX`. Org admins may still
  switch **org-scope** flags for their own org but can never re-enable a platform/market OFF. The org page shows the effective value and its source.
- **API**: `GET /feature-flags/effective` (current org), `GET /admin/platform/feature-flags-status` (managed + snapshot age).

## OFF contract (FF04)

`@RequiresFeature(key)` + `FeatureGuard` on controllers (or `requireFeature()` in services) return
`403 { code: "FEATURE_DISABLED", key, scope }`. Only **new actions** are blocked; reads, print and export of existing records
keep working. In web, wrap UI with `<Feature flag="…">` (`apps/web/src/features/flags`). Tests: `ff04-feature-guard.node.test.ts`
(per-flag OFF at every scope) and `ff01-registry.node.test.ts` (every flag has an enforcement site).

**Safety controls are never flags (ADR-025)**: Rx safety checks, encounter sign-off/lock/amendments, audit logging, consent
enforcement, record view/print/export, privileged MFA, tenant isolation/authorization, breach tooling. `safety-controls.ts`
lists their code paths; `ff-safety-never-flags.node.test.ts` fails if any flag guard/check appears there or a flag key names a safety control.

---

## Three layers

| Layer | Who edits | Web UI | API |
|-------|-----------|--------|-----|
| **Platform (global)** | Kiorex super admin (read-only mirror here when managed) | Platform → **Overview** → Global feature flags | `GET/PATCH /api/v1/admin/platform/feature-flags/:key` |
| **Market (country)** | Kiorex super admin (read-only mirror here when managed) | Platform → **Market launch** → **Flags** on a live market | `GET/PATCH /api/v1/admin/platform/markets/:id/feature-flags/:key` |
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