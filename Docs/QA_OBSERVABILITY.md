# QA-05 Observability & alerting (money + booking)

| Item | Status |
|------|--------|
| Operational alerts + runbooks + on-call hooks | **Done** |

## Scope

- **Alert catalog:** `apps/api/src/observability/operational-alerts.ts` (7 alerts aligned with money/booking paths).
- **Dashboards (ops):** panel definitions + query hints in the same module (Grafana/CloudWatch Insights — not in-app UI).
- **Tracing / errors:** `telemetry.bootstrap.ts` on API boot (`SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`).
- **On-call:** `PLATFORM_ONCALL_SLACK_WEBHOOK_URL`, optional `PLATFORM_ONCALL_WHATSAPP_WEBHOOK_URL` → `notifyOnCall()`.
- **Schedulers:** `ObservabilityHealthService` (signup funnel + WhatsApp spike); existing MN-04 ETA, outbox, settlement, integration spike wiring calls `notifyOnCall`.

## Dashboards → alerts

| Dashboard | Alerts |
|-----------|--------|
| ETA success | `ETA_SUCCESS_BELOW_THRESHOLD` |
| WhatsApp delivery | `WHATSAPP_DELIVERY_FAILURE_SPIKE` |
| Outbox lag | `OUTBOX_PENDING_LAG` |
| Settlement job | `SETTLEMENT_JOB_FAILED` |
| Payment webhooks | `KIORLY_PAYMENT_WEBHOOK_FAILED` |
| Signup funnel | `SIGNUP_FUNNEL_DROP` |
| Integration failures | `INTEGRATION_FAILURE_SPIKE` |

## Runbooks

One markdown file per alert under [`Docs/runbooks/`](./runbooks/) — required sections enforced by `qa05-operational-alerts.node.test.ts`.

## Tests

```bash
npm run test:unit -w api -- --test-name-pattern=QA-05
```

## CI / local env

| Variable | Purpose |
|----------|---------|
| `PLATFORM_ONCALL_SLACK_WEBHOOK_URL` | Slack incoming webhook |
| `PLATFORM_ONCALL_WHATSAPP_WEBHOOK_URL` | Generic JSON bridge to on-call WhatsApp |
| `SENTRY_DSN` / `OTEL_*` | External APM (documented at boot) |
| `DISABLE_OBSERVABILITY_SCHEDULER=true` | Skip hourly funnel/spike checks (dev) |

## Follow-ups

- Enable App Runner **X-Ray / observability** in CDK when OTel collector is standard.
- Ship `@sentry/node` in production image when DSN is set.
- In-app **platform ops** dashboard (read-only JSON) for panel metrics — today use Governance + ETA health UI.
- CloudWatch alarm templates wired to the same Slack webhooks.