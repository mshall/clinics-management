# WhatsApp Business (MS-01 / MS-02)

| Item | Status |
|------|--------|
| MS-01 Meta Cloud templates + webhooks | **Done** |
| MS-02 Confirm / cancel / reschedule replies | **Done** |
| MS-03 Consent & opt-out | **Done**
| MS-04 Doctor & owner digests | **Done** — see [Doctor & owner digests](#doctor--owner-digests-ms-04) | ([MESSAGING_CONSENT.md](./MESSAGING_CONSENT.md)) |
| MS-05 Transactional email | **Done** | ([MESSAGING_EMAIL.md](./MESSAGING_EMAIL.md)) |

## Provider

- **Production:** Meta WhatsApp Cloud API — template messages only (no free-form outside the 24h care window).
- **Market config:** `Market.providerConfig.messaging.whatsapp.templates` maps logical keys (`appointment_reminder_whatsapp`, `auth_otp`, …) to approved template **name**, **language**, and **variable** order.
- **Platform sender:** `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` (clinic-owned numbers: future `phoneNumberId` override per market pack).

## Queue

`OutboundMessage` stores `templateKey`, `templateName`, `variablesJson`, `providerMessageId`, delivery/read timestamps, `failureClass`, and retry metadata. Worker sends via `WhatsAppSendService`; OTP/signup still use dev legacy only outside production.

## Webhook

- `GET /api/v1/webhooks/whatsapp` — Meta verification (`WHATSAPP_VERIFY_TOKEN`).
- `POST /api/v1/webhooks/whatsapp` — `X-Hub-Signature-256` validated with `WHATSAPP_APP_SECRET`; updates `deliveredAt` / `readAt` / `FAILED`, and processes **inbound quick-reply buttons** (`KIORLY_CONFIRM` / `KIORLY_CANCEL` / `KIORLY_RESCHEDULE`) via `context.message_id` → outbound `providerMessageId` → appointment.

### Inbound actions (MS-02)

| Payload | Effect |
|---------|--------|
| `KIORLY_CONFIRM` | `CONFIRMED`, `whatsappConfirmedAt`, outbox `front_desk.appointment_whatsapp_reply`, audit |
| `KIORLY_CANCEL` | `CANCELLED`, waitlist offer (FS-03), outbox + audit |
| `KIORLY_RESCHEDULE` | Queues `appointment_reschedule_link` with `/r/:token` (KX-09 public page) |

Dedup: `WhatsAppInboundEvent.providerMessageId` is unique per inbound Meta message id.

## API (tenant JWT, `mod_messaging`)

- `GET /messaging/outbound?patientId=&appointmentId=`
- `GET /messaging/failures` — Governance tab **WhatsApp delivery**.

## UI

Patient and appointment detail: message log with delivery ticks. Appointment detail: **Confirmed by WhatsApp** chip when `whatsappConfirmedAt` is set. Public reschedule: `GET/POST /api/v1/public/appointments/reschedule/:token` + web `/r/:token`. Admin → Governance → WhatsApp delivery.

## Tests

- `ms01-whatsapp.node.test.ts` — template config, free-form block, signature, retry.
- `ms01-whatsapp.integration.test.ts` — webhook status latency, policy without `templateKey`.
- `ms02-whatsapp-replies.node.test.ts` — quick-reply payload mapping.
- `ms02-whatsapp-replies.integration.test.ts` — cancel → waitlist `OFFERED`, confirm → `whatsappConfirmedAt`.

## Follow-ups

- Clinic-owned WhatsApp numbers (per-tenant credential).
- Signup/login OTP via `auth_otp` template without legacy free-form.
- PDF header media for lab results template.

## Doctor & owner digests (MS-04)

Scheduler jobs (market timezone) deliver WhatsApp templates and in-app notices. Preferences live on **Profile** (`GET/PUT /digests/preferences`); unread notices at `GET /digests/notices`.

| Digest | Who | When | Template |
|--------|-----|------|----------|
| Tomorrow's list | Physicians | 20:00 local | `doctor_tomorrow_digest` |
| Shift cash summary | Owners | After shift close (MN-03) | `owner_shift_summary` |
| Weekly insights | Owners (Pro+ `mod_messaging`) | Sunday 18:00 local | `owner_weekly_insights` |
| Kiorly-free progress | Owners | When CR-07 thresholds 50/80/100 are first crossed | `kiorex_progress_nudge` |
| Monthly recap | Owners | 1st of month 10:00 local | `kiorex_monthly_recap` |

**Quiet hours** (default 21:00–08:00 local) and **opt-out** skip delivery. `DigestSendLog` keeps each send idempotent per user/kind/period. CR-07 follow-up: threshold rows still write `KiorexProgressNudge` + `AuditLog`; MS-04 also queues WhatsApp and `StaffInAppNotice` copy (not AuditLog-only).
