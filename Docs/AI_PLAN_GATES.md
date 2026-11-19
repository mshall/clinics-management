# AI plan gates (AI-04)

| Entitlement | Lite | Pro | Clinic+ | Notes |
|-------------|------|-----|---------|--------|
| `ai_assistant` | ✗ | ✓ | ✓ | Role assistant + pre-visit smart summary |
| `ai_scribe` | ✗ | Add-on | ✓ | Ambient speech scribe (AI-02) |

## Quota

`UsageMetric.AI_ASSISTANT_REQUESTS` — plan limits in `usage-limits.ts`. LLM replies call `assertAiAssistantQuota` then `incrementOnce`.

## UI

- Lite: floating **UpgradeHint** for the assistant (`data-testid="assistant-upgrade-hint"`).
- Scribe panel on encounters is wrapped in `EntitlementGate` for `ai_scribe`.

## Tests

- `ai04-ai-plan-gates.node.test.ts`
- Existing `pl03-entitlements.integration.test.ts` (Lite → 402 on `ai_assistant`)
