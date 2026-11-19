# FLAG_SNAPSHOT_STALE — Kiorex feature-flag snapshot older than 10 minutes

Alert id `FLAG_SNAPSHOT_STALE` (FF06). Raised by `KiorexFlagSnapshotService` when no successful contact with the
Kiorex control plane (`GET /api/v1/control/v1/flags/snapshot?product=kiorly-clinic`, 200 or 304) has happened for
more than `KIOREX_FLAGS_STALE_ALERT_MS` (default 10 minutes).

Kiorly Clinic is **fail-static**: it keeps evaluating the last-known snapshot (persisted in `KiorexFlagSnapshot`), so
nothing breaks, but a super-admin kill switch would not reach this product until the poll recovers.

## Symptoms

- On-call Slack/WhatsApp message `FLAG_SNAPSHOT_STALE` with `ageSeconds` and `lastError`.
- Platform → Overview flag page shows the snapshot age in red.
- Log line `FLAG_SNAPSHOT_STALE` from the `KiorexFlagSnapshot` logger.

## First actions

1. Check `lastError` in the alert payload (`KiorexFlagSnapshot.lastError`): 401 = product key/secret mismatch, 5xx or fetch failed = control plane down.
2. Verify `KIOREX_CONTROL_PLANE_URL`, `KIOREX_FLAGS_PRODUCT_KEY`, `KIOREX_FLAGS_SECRET` on the service and that the Kiorex API is reachable from the app network.
3. Trigger a manual refresh by sending a signed `flag.changed` webhook, or restart the task (the persisted snapshot is reloaded).
4. If the control plane will stay down, tell the super-admin on call that flag changes will not propagate; do **not** edit flags locally (pages are read-only mirrors).

## Escalation

Platform on-call → Kiorex platform team (owners of the flag control plane). Escalate to the founder if a safety-critical OFF toggle (e.g. a payment kill switch) is pending and cannot propagate.
