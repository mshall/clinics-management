# Support operations & WhatsApp support line (GT-04)

| | |
|---|---|
| **Status** | **Done** (code) — Meta number + staffing remain human |
| **Step** | 098 · GT-04 |
| **Hours** | Sun–Thu 09:00–18:00 (`Africa/Cairo` default) |
| **P1 first response** | 4 business hours (`URGENT`) |

## What shipped

- **First-response SLA** measured on every ticket: `firstResponseDueAt` at create, `firstRespondedAt` on first staff comment/macro/escalation; DTO includes `sla.{targetHours,breached,responseMinutes,dueAt}`.
- **WhatsApp support line:** set `KIORLY_SUPPORT_WHATSAPP_NUMBER` (digits). Free-text inbound to that Meta display number creates a `channel=WHATSAPP` ticket (matched by employee phone, else `SUPPORT_FALLBACK_TENANT_ID`). Idempotent via `WhatsAppInboundEvent`.
- **Macros:** `GET /support/macros`, `POST /support/tickets/:id/macros/:macroId`.
- **Engineering escalation:** `POST /support/tickets/:id/escalate-engineering`.
- Support inbox UI shows SLA badges, macros and escalate actions (EN/AR).

## Needs human

- Provision Meta WhatsApp Business number for Kiorly support and set `KIORLY_SUPPORT_WHATSAPP_NUMBER` + webhook (NH-023).
- Staff the Sun–Thu queue and define who receives engineering escalations.
