# Messaging consent & opt-out (MS-03)

| Item | Status |
|------|--------|
| MS-03 Consent, STOP / إلغاء, marketing gate | **Done** |

## Model

`MessagingConsent` — per patient, `MessageChannel`, and purpose (`TRANSACTIONAL` | `MARKETING`).

**Defaults (when no row):**

- `TRANSACTIONAL` → granted (care-related reminders)
- `MARKETING` → not granted (recall campaigns require explicit opt-in)

## API

- `GET /api/v1/patients/:id/messaging-consent` — effective toggles (defaults applied)
- `PUT /api/v1/patients/:id/messaging-consent` — `{ consents: [{ channel, purpose, granted }] }`

Audited as `MESSAGING_CONSENT_UPDATED`.

## Send gates

All outbound queue paths check consent by template key:

- Transactional: `appointment_reminder_whatsapp`, `appointment_reschedule_link`, …
- Marketing: `recall_*` template keys via `queueRecallCampaignMessage`

Worker marks `FAILED` / `failureClass: CONSENT` if consent revoked after queueing.

## WhatsApp opt-out

Inbound `text` messages matching **STOP** or **إلغاء** (and variants) revoke **both** transactional and marketing WhatsApp consent for matching patient phone(s). Audited as `MESSAGING_CONSENT_WHATSAPP_OPT_OUT`.

## UI

Patient profile → **Messaging consent** card (en + ar).

## Tests

- `ms03-messaging-consent.node.test.ts` — purpose classification, keywords, defaults
- `ms03-messaging-consent.integration.test.ts` — marketing blocked until opt-in

## Follow-ups

- SMS inbound STOP (provider-specific)
- Campaign runner UI wiring to `queueRecallCampaignMessage`
- Unified enforcement via `ConsentPolicyService` — [PATIENT_CONSENT.md](./PATIENT_CONSENT.md) (SC-03)