# Settlement job failed (SETTLEMENT_JOB_FAILED)

## Symptoms

- On-call alert **SETTLEMENT_JOB_FAILED** from `SettlementScheduler`
- Log: `Settlement scheduler` warnings with stack/message
- Missing monthly `KiorlyInvoice` lines for Cairo commission tenants

## First actions

1. Confirm `SettlementScheduler` tick errors in CloudWatch (search `Settlement scheduler`).
2. Platform super-admin: dry-run settlement for affected `periodKey` via settlement API.
3. Verify Kiorex commission rows and subscription period boundaries (CR-06).
4. Re-run platform **run settlement** for one tenant after fixing data; then batch.

## Escalation

- **L2:** Billing-platform engineer — DB transaction rollback root cause.
- **Finance:** Communicate invoice delay to affected tenants.