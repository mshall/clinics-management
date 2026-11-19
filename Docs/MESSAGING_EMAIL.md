# Transactional email (MS-05)

| Item | Status |
|------|--------|
| EmailService + bilingual templates | **Done** |
| SES provider (eu-central-1) | **Done** (gated) |
| Bounce / complaint webhook | **Done** |
| DKIM / SPF / DMARC gate | **Done** (code) — DNS live = NH-016 |

## Provider

- **Production:** Amazon SES in `eu-central-1` (Frankfurt cell). Enable with `EMAIL_SES_ENABLED=1`.
- **From:** `platform/email-domain-auth.json` → `fromAddress` (default `noreply@mail.kiorly.com`).
- **Dev / test:** `DevEmailProvider` records `EmailMessage` with a synthetic `providerMessageId` (no AWS call).

## Domain authentication (acceptance)

Production sends are **blocked** unless all three are true for the sending domain:

| Check | Source |
|-------|--------|
| DKIM | `email-domain-auth.json` `dkimVerified` or `EMAIL_DKIM_VERIFIED=1` |
| SPF | `spfVerified` / `EMAIL_SPF_VERIFIED=1` |
| DMARC | `dmarcVerified` / `EMAIL_DMARC_VERIFIED=1` |

Failure class: `DOMAIN` / error `EMAIL_DOMAIN_AUTH_INCOMPLETE`. Flip the JSON flags only after SES domain identity + DNS are verified (NH-016).

## Templates (EN + AR)

| Key | Trigger |
|-----|---------|
| `trial_notification` | INTERNAL outbox `billing.trial_notification` (email channel) |
| `kiorly_invoice_statement` | INTERNAL outbox `billing.monthly_statement_ready` (email channel) |
| `password_reset` | `POST /auth/password/forgot` with email |
| `security_alert` | After successful password reset (sessions revoked) |

## Persistence & bounces

- `EmailMessage` rows: `QUEUED` → `SENT` / `FAILED` / `BOUNCED`.
- `POST /api/v1/webhooks/email/ses` — SES SNS bounce/complaint (optional `x-kiorly-email-webhook-secret` = `EMAIL_SES_WEBHOOK_SECRET`).

## Env

```
EMAIL_SES_ENABLED=1
EMAIL_SES_REGION=eu-central-1
EMAIL_FROM_ADDRESS=noreply@mail.kiorly.com
EMAIL_SENDING_DOMAIN=mail.kiorly.com
EMAIL_DKIM_VERIFIED=1
EMAIL_SPF_VERIFIED=1
EMAIL_DMARC_VERIFIED=1
EMAIL_SES_WEBHOOK_SECRET=
EMAIL_DOMAIN_AUTH_PATH=   # optional override of platform/email-domain-auth.json
EMAIL_DEV_LOG=1           # log subjects in dev
```

## Tests

- `ms05-transactional-email.node.test.ts` — templates + DKIM/SPF/DMARC production gate.
- `ms05-transactional-email.integration.test.ts` — trial send, outbox statement delivery, bounce record.
