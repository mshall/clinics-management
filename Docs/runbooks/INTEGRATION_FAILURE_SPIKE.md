# Integration failure spike (INTEGRATION_FAILURE_SPIKE)

## Symptoms

- Audit `INTEGRATION_FAILURE_SPIKE` for a tenant
- On-call alert **INTEGRATION_FAILURE_SPIKE**
- Governance UI spike banner; booking/API partner errors

## First actions

1. Admin → Governance → **Failing operations** — sort by last hour; note categories (APPOINTMENT, WEBHOOK, AUTH).
2. Use correlation id from partner request (`X-Kiorly-Correlation-Id`) to open failure detail trace.
3. If AUTH: rotate integration client secret; if APPOINTMENT: validate patient/branch ids.
4. Acknowledge resolved rows after partner fix to clear noise.

## Escalation

- **L2:** Integrations engineer — rate limits, schema drift, marketplace HMAC clock skew.
- **Partner:** Kiorex/call-center ops for booking path outages.