# Mock providers and the dev inbox

> **Founder decision, 19 Nov 2026.** Email, WhatsApp, SMS, push, payment providers (Paymob / Fawry / InstaPay), video,
> maps, OpenAI and every other third-party provider run on **mock adapters** until every other feature is verified. Real
> providers are wired in a dedicated pass before launch, in staging first. See "Provider go-live" in
> [KIORLY_NEEDS_HUMAN.md](./KIORLY_NEEDS_HUMAN.md).

## Mode switch

| Variable | Effect |
|----------|--------|
| `KIORLY_PROVIDER_MODE` | Global default: `mock` (default) or `real` |
| `KIORLY_PROVIDER_MODE_<KIND>` | Per integration: `EMAIL`, `WHATSAPP`, `SMS`, `PUSH`, `PSP`, `MAPS`; wins over the global value |

Unset means **mock**, in every environment. One back-compat rule: a **production** deployment that already carries the
old enabling switch (`EMAIL_SES_ENABLED=1`, a WhatsApp access token, VAPID keys) stays real until the mode is set
explicitly. Code: `apps/api/src/common/provider-mode.ts`. No credentials live in code.

Mock adapters exercise the same code paths as the real ones: templates are rendered, consent and quota are checked,
the market WhatsApp template and quick-reply buttons are resolved, `OutboundMessage` / `EmailMessage` rows are written,
delivery states and webhooks are processed by the real handlers. Only the final network call is replaced by a row in
the dev inbox.

| Kind | Mock behaviour |
|------|----------------|
| Email | `DevEmailProvider`; `EmailService` mirrors subject, text and HTML into the inbox |
| WhatsApp | `WhatsAppSendService` and the free-form sender record the message, variables, quick replies and document link |
| SMS | Outbound worker marks the message `SENT` with a deterministic id and records it |
| Push | `PushService` records the notification instead of calling web-push |
| PSP | Gateways return deterministic fake sessions/charges; callbacks are simulated (below) |
| Maps | `MockRouteMapsAdapter`: deterministic symmetric district-to-district travel minutes (10-45), mock navigation links; same `RouteMapsPort` the Amazon Location adapter will implement (PG-10) |
| Safety alerts (SMS) | `MockSafetyAlertDispatcher` writes the alert (no address, no patient data) to the dev inbox as an SMS to the organisation safety contact; the same `safety_alert.*` log events are emitted so the infra alarms and the drill run unchanged (PG-13) |

## Dev inbox

- **Page:** `/dev/inbox` in the web app (no login, because signup OTPs have no session yet).
- **API:** `/api/v1/dev/inbox`
  - `GET /status` provider modes · `GET /?channel=&to=&direction=&limit=` list · `GET /messages/:id`
  - `POST /messages/:id/delivery` `{ state: delivered | read | failed | bounced }`: goes through the Meta status-webhook handler (WhatsApp/SMS) or `EmailService.recordBounce`
  - `POST /inbound/whatsapp` `{ fromPhone, text | buttonPayload, replyToId? }`: goes through `WhatsAppWebhookService` (STOP opt-out, reminder Confirm/Cancel, waitlist Accept/Decline, AI receptionist, support line)
  - `POST /psp/callback` `{ provider: paymob | fawry, outcome: succeeded | failed, tenantId, invoiceId, amount? }`: signed with the dev secret and sent through `KiorlyPaymentService.handleWebhook`
- **Storage:** table `DevInboxMessage`, written **only** by mock adapters, never in real mode.
- **Access:** open in any non-production `NODE_ENV`. In production it returns 404 unless `DEV_INBOX_ENABLED=1`, and then every call needs the header `X-Dev-Inbox-Key` (= `DEV_INBOX_KEY`).

## Typical checks

1. Sign up with a phone: the OTP appears in the inbox as a WhatsApp message.
2. Book an appointment with reminders on: the reminder appears with its Confirm / Cancel buttons; press one to simulate the reply.
3. Cancel an appointment with a waitlist: the offer appears; press Accept; mark it delivered/read.
4. Open a Kiorly invoice: fire a Paymob `succeeded` callback and watch it turn PAID.

Tests: `dev-inbox/dev-inbox.integration.test.ts`, `common/provider-mode.node.test.ts`.
