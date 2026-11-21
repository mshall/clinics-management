# Provider secrets and params to add at go-live (do not apply from this note automatically)

The App Runner service takes runtime secrets as `env var name => Secrets Manager ARN` (`infra/tofu/modules/aws/container-service`,
variable `secrets`; the instance role needs the ARNs in `secret_read_arns`) and plain params as environment variables.
Nothing below has been applied; no `tofu` / deploy was run.

## Plain environment variables (non-secret)

| Kind | Variables |
|------|-----------|
| All | `KIORLY_PROVIDER_MODE_SMS`, `KIORLY_PROVIDER_MODE_EMAIL`, `KIORLY_PROVIDER_MODE_WHATSAPP`, `KIORLY_PROVIDER_MODE_PSP` = `real` |
| SMS | `SMS_API_URL`, `SMS_SENDER_ID` |
| Email (http) | `EMAIL_TRANSPORT=http`, `EMAIL_API_URL`, `EMAIL_FROM_ADDRESS` |
| WhatsApp (http BSP) | `WHATSAPP_PROVIDER=http`, `WHATSAPP_API_URL`, `WHATSAPP_SENDER_ID` |
| WhatsApp (Meta Cloud) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` (optional) |
| PSP | `PSP_API_URL`, `PSP_MERCHANT_ID`, `PSP_CALLBACK_URL` |
| Tuning (optional) | `SMS_/EMAIL_/WHATSAPP_/PSP_` + `TIMEOUT_MS`, `MAX_RETRIES`, `RETRY_BACKOFF_MS` |

## Secrets (Secrets Manager, one secret each, referenced in the `secrets` map)

`SMS_API_KEY`, `SMS_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `WHATSAPP_API_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`,
`PSP_API_KEY`, `PSP_WEBHOOK_SECRET`. Meta Cloud instead: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
SES keeps its existing identity/DNS setup (NH-016) and `EMAIL_SES_WEBHOOK_SECRET`.

## Networking

Outbound HTTPS from the service to each vendor host (the network module reaches AWS APIs privately; vendor hosts need NAT/egress).
Inbound: vendors call `/api/v1/webhooks/providers/{sms|whatsapp|email}` and `/api/v1/webhooks/payments/{paymob|fawry}` (add the
paths to any WAF allow rules; they authenticate by HMAC, not JWT).

The API refuses to start with a kind in `real` mode and any required variable missing, so a half-applied change fails at deploy
health check instead of sending nothing silently.
