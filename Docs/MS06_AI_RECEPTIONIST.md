# MS-06 — WhatsApp AI receptionist (Egyptian Arabic)

| | |
|---|---|
| Status | **Done** |
| Webhook | Free-text clinic WhatsApp → intent handler |
| Inbox | `GET /messaging/ai-receptionist/inbox` · UI `/messaging/ai-receptionist` |

Intents: booking / reschedule (SlotService), prices, location, hours, staff handover. **Clinical questions never receive medical advice** — reply hands over to reception. Turns stored in `WhatsAppReceptionistTurn`. See [MESSAGING_WHATSAPP.md](./MESSAGING_WHATSAPP.md).
