# ETA success below threshold (ETA_SUCCESS_BELOW_THRESHOLD)

## Symptoms

- Audit action `ETA_SUCCESS_BELOW_THRESHOLD` or on-call alert **ETA_SUCCESS_BELOW_THRESHOLD**
- Admin **Compliance → ETA health** shows yesterday’s success rate under **95%**
- Invalid `FiscalSubmission` rows or FISCAL integration failures rising

## First actions

1. Open ETA health for the affected tenant (pilot window vs custom range).
2. Review **top rejection classes** and open [ETA_REJECTION_RUNBOOK.md](./ETA_REJECTION_RUNBOOK.md) for the matching key (`credentials`, `buyer_name`, etc.).
3. Check `IntegrationFailureLog` category **FISCAL** and the fiscal queue (`FiscalSubmission` status `REJECTED` / `SUBMITTING`).
4. If credentials: rotate ETA secrets in Secrets Manager and re-run a single test receipt from staging.
5. If validation spikes on one branch: verify branch TRN / activity code in clinic settings.

## Escalation

- **L2:** Platform ops + compliance engineer — enable read-only ETA API status poll if submissions stuck in `SUBMITTING`.
- **Clinic:** Notify finance lead; pause high-volume billing until success rate recovers (see [MN04_ETA_PRODUCTION.md](../MN04_ETA_PRODUCTION.md)).