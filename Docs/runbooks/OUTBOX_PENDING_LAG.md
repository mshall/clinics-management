# Outbox pending lag (OUTBOX_PENDING_LAG)

## Symptoms

- API log: `Outbox lag alert: oldest PENDING > 2 minutes`
- On-call alert **OUTBOX_PENDING_LAG**
- Kiorex/marketplace events not arriving; `OutboxEvent` PENDING age growing

## First actions

1. Platform admin → outbox summary (pending count, oldest `createdAt`).
2. Check `KIOREX_OUTBOX_WEBHOOK_URL` reachability and recent DEAD/FAILED rows.
3. Restart API only if dispatcher thread stalled; otherwise run manual retry for FAILED (non-dead) rows.
4. Inspect Integration failures for webhook 5xx to Kiorex.

## Escalation

- **L2:** Increase dispatcher capacity; fix partner endpoint or rotate webhook secret.
- **Booking path:** Kiorex ops if marketplace bookings lack confirmation events.