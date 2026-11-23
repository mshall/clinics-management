# Provider integration (SMS, Email, WhatsApp, Payments)

Going live with a real provider is **env/secrets only**. Every kind has a port, a `mock` implementation (default) and a
generic `real` JSON-over-HTTP implementation. The only code to touch for a vendor whose JSON differs is that kind's
`*.mapping.ts` file. Mock behaviour and the dev inbox: [MOCK_PROVIDERS.md](./MOCK_PROVIDERS.md).

## Inventory (apps/api)

| Integration | Port / selection | Mock | Real |
|-------------|------------------|------|------|
| SMS | `messaging/providers/sms.port.ts`, `createSmsProvider()` (`KIORLY_PROVIDER_MODE_SMS`) | `MockSmsProvider` -> dev inbox | `HttpSmsProvider` (`SMS_*`) |
| Email | `messaging/email.provider.ts`, `EMAIL_TRANSPORT=ses\|http` | `DevEmailProvider` | SES (adapter in `platform/adapters`) or `HttpEmailProvider` (`EMAIL_*`) |
| WhatsApp | `WhatsAppSendService`, `WHATSAPP_PROVIDER=meta_cloud\|http` | dev inbox | `MetaCloudWhatsAppProvider` or `HttpWhatsAppProvider` (`WHATSAPP_*`) |
| Payments | `billing-platform/payment-gateways` (`PaymentGatewayRegistry`) | `PaymobGateway` / `FawryGateway` fakes | `HttpPspGateway` for `paymob` and `fawry` (`PSP_*`); InstaPay / bank stay manual-proof |
| Web push | `push/` (`KIORLY_PROVIDER_MODE_PUSH`, VAPID keys) | recorded in inbox | web-push |
| Storage | `storage/` local FS, S3 adapter in production (`UPLOAD_*`) | local | S3 |
| Maps, OpenAI | see PG-10 / PG-11 in KIORLY_NEEDS_HUMAN.md | mock | out of scope here |

ETA e-invoice is retired (FD-02, ADR-011); there is no tax-authority integration.

Mode precedence: `KIORLY_PROVIDER_MODE_<KIND>` > `<KIND>_MODE` (`SMS_MODE`, `EMAIL_MODE`, `WHATSAPP_MODE`, `PSP_MODE`) >
`KIORLY_PROVIDER_MODE` > mock.

## Cross-cutting behaviour (all real adapters)

- **HTTP helper** `common/provider-http.ts`: `<PREFIX>_TIMEOUT_MS` (10000), `<PREFIX>_MAX_RETRIES` (2), `<PREFIX>_RETRY_BACKOFF_MS` (300), exponential backoff with jitter, `Retry-After` honoured. Retries on network error, timeout, 408/425/429/5xx. 401/403 -> `AUTH`, other 4xx -> permanent, never retried.
- **Idempotency**: every call sends `Idempotency-Key` (the OutboundMessage / EmailMessage / payment idempotency key), the same value on every retry.
- **Secrets are never logged**: errors pass through `redactSecrets`; startup errors name variables only.
- **Fail fast**: `main.ts` calls `assertProviderEnv()`. With a kind in `real` mode and a missing URL / key / sender / webhook secret (or a non-https URL in production) the API refuses to boot and lists the variable names.
- **Webhooks**: HMAC-SHA256 of the raw body with the kind's secret, hex or base64, optional `sha256=` prefix, header `X-Kiorly-Signature` (or `X-Signature`). If `X-Kiorly-Timestamp` is sent the signed string is `${timestamp}.${rawBody}` with 5 minutes tolerance. Missing secret or signature fails closed (401).

## Neutral contracts (adapt in the mapping file only)

All requests are `POST` JSON with `Authorization: Bearer <key>` and `Idempotency-Key`. Responses need a message/payment id
(`id`, `messageId`, `message_id`, `data.id` or `messages.0.id` are all found).

**SMS** `POST SMS_API_URL` (`messaging/providers/sms.mapping.ts`)
`{ "to": "+201001112233", "from": "<SMS_SENDER_ID>", "text": "...", "reference": "<OutboundMessage.id>" }` -> `{ "id": "..." }`

**Email** `POST EMAIL_API_URL` (`email-http.mapping.ts`)
`{ "from", "to", "subject", "text", "html", "tags": {}, "reference": "<EmailMessage.id>" }` -> `{ "id": "..." }`

**WhatsApp** `POST WHATSAPP_API_URL` (`whatsapp-http.mapping.ts`)
`{ "from": "<WHATSAPP_SENDER_ID>", "to", "reference", "template": { "name", "language", "body_parameters": ["..."], "quick_reply_payloads": ["..."], "document": { "link", "filename" } } }` -> `{ "id": "..." }`.
Free-form text is never sent in production (24 h window rule); templates come from the market pack.

**Delivery receipts (SMS / WhatsApp http / Email http)** `POST /api/v1/webhooks/providers/{sms|whatsapp|email}`
`{ "events": [ { "id": "<provider message id>", "status": "sent|delivered|read|failed|bounced", "timestamp": 1735689600, "error": "optional" } ] }`
(synonyms such as `undelivered`, `rejected`, `seen` are normalised in `delivery-receipt.ts`). Receipts are persisted on `OutboundMessage` (`status`, `deliveredAt`, `readAt`, `error`, `failureClass`) or `EmailMessage` (bounce handling), monotonic and idempotent; failures write an audit event. Meta Cloud keeps `/api/v1/webhooks/whatsapp`, SES keeps `/api/v1/webhooks/email/ses`.

**PSP** `POST PSP_API_URL` + path (`billing-platform/payment-gateways/psp.mapping.ts`)

| Path | Request | Response |
|------|---------|----------|
| `/payment-links` | `{ merchant_id, reference, amount:"100.00", currency, callback_url, metadata:{tenant_id,invoice_id} }` | `{ id, payment_url, reference_code? }` |
| `/card-sessions` | `{ merchant_id, return_url, customer_email, metadata:{tenant_id} }` | `{ id, iframe_url, redirect_url }` (card data stays on the PSP page) |
| `/charges` | `{ merchant_id, token, amount, currency, reference, metadata }` | `{ id, status }` |
| `/refunds` | `{ merchant_id, payment_id, amount, currency, reference }` | `{ id, status: pending\|succeeded\|failed }` |

Webhook `POST /api/v1/webhooks/payments/{paymob|fawry}`:
`{ "event_id", "type": "payment.succeeded|payment.failed|payment.pending|refund.succeeded|refund.failed", "payment_id", "amount", "currency", "metadata": { "tenant_id", "invoice_id" } }`.
Deduplicated by `event_id` (`KiorlyPaymentWebhookEvent`). Refunds: `KiorlyPaymentService.refundPaymentInternal` (idempotency key `refund_<paymentId>_<amount>`); a synchronous success or a `refund.succeeded` webhook marks the payment `REFUNDED` and reverses it on the invoice.

## Provider go-live checklist

1. Choose the vendor; get API URL, key, sender id / merchant id, webhook secret. Put them in Secrets Manager (see [PROVIDER_INFRA_NOTE.md](./PROVIDER_INFRA_NOTE.md)); never in git.
2. If the vendor's JSON differs from the neutral shape, edit only the kind's `*.mapping.ts` and extend `providers-real-mode.node.test.ts`.
3. Staging first: set `KIORLY_PROVIDER_MODE_<KIND>=real` plus the variables. The API must boot (otherwise the message names the missing variable).
4. Point the vendor's webhook at the receipt / payment URL above with the same secret. Send a signed test event.
5. Smoke test through the live port: `POST /api/v1/dev/inbox/send-test` `{ channel: sms|email|whatsapp, to, tenantId }` (staging with `DEV_INBOX_ENABLED=1` + `DEV_INBOX_KEY`; send to your own number/email). Confirm the receipt flips the `OutboundMessage` / `EmailMessage` status.
6. PSP: pay a small invoice end to end (link or hosted card), confirm the webhook marks it PAID, then refund it and confirm `REFUNDED`.
7. WhatsApp: templates approved and present in the market pack `providerConfig.messaging.whatsapp.templates`; consent captured (MESSAGING_CONSENT.md).
8. Turn the dev inbox off (`DEV_INBOX_ENABLED` unset) once providers are real; it is 404 in production by default.
9. Watch `OutboundMessage` rows in `FAILED`/`RETRY` and the `*_DELIVERY_FAILED` audit events for the first day.

Tests: `messaging/providers/providers-real-mode.node.test.ts` (local fake HTTP server: request shape, retries, idempotency, HMAC, fail-fast),
`billing-platform/provider-flows.integration.test.ts` (mock payment success / failure / refund, SMS delivery receipts).
