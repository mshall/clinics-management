# PL-05 — Usage metering & quotas

| Status | **Done** |

Monthly per-tenant counters for WhatsApp, SMS, AI scribe minutes, AI assistant requests, and active clinicians.

## API

- `GET /api/v1/billing/usage?period=YYYY-MM` — limits vs usage (`UsageMeterService`)

## Behaviour

- Idempotent increment keyed by `UsageMeterDedup` (`sourceId` = outbound message id, assistant request uuid).
- WhatsApp enqueue and worker send paths increment `WHATSAPP_MESSAGES`.
- Assistant LLM replies increment `AI_ASSISTANT_REQUESTS`.
- At 100% WhatsApp quota, new WhatsApp queues return `403 USAGE_QUOTA_EXCEEDED`.

## UI

Admin → Plan & billing — usage bars (EN/AR).

## Tests

- `pl05-usage-meter.node.test.ts`
- `pl05-usage-meter.integration.test.ts`