# WhatsApp delivery failure spike (WHATSAPP_DELIVERY_FAILURE_SPIKE)

## Symptoms

- On-call alert **WHATSAPP_DELIVERY_FAILURE_SPIKE** (>12 `WHATSAPP_DELIVERY_FAILED` audits in 1h)
- Reminders/OTP messages show `OutboundMessage.status = FAILED`
- Meta webhook errors (`template`, policy, or 1320-class codes)

## First actions

1. Admin → Messaging / outbox — filter failed WhatsApp rows; note `failureClass` (TEMPLATE vs POLICY).
2. Verify WABA token, template names, and locale match approved Meta templates ([MS-01](../../apps/api/src/messaging)).
3. If template errors: disable affected template campaign; use SMS fallback if configured.
4. Check Meta Business status page and webhook verify token / app secret rotation.

## Escalation

- **L2:** Engagement engineer — replay safe messages after template fix; purge dead outbox rows if needed.
- **Product:** Pause marketing bursts until delivery rate stabilizes.