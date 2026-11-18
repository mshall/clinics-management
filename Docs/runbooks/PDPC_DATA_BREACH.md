# Personal data breach — Egypt PDPL (SC-02)

## Symptoms

- Confirmed or suspected unauthorized access, loss, or disclosure of Egyptian personal data (patient or staff)
- RDS/S3 incident, stolen laptop, mis-sent message, integration leak
- Audit or security tool flags PHI exfiltration

## First actions

1. **Contain** within 1 hour: disable affected integration token, rotate credentials, block user/session, isolate clinic if needed.
2. **Record** time you became aware, data categories, approximate data subjects, and likely cause (ticket + audit metadata — no PHI in ticket title).
3. **Assess** whether notification is required (risk to rights/freedoms under PDPL).
4. **Notify Kiorly platform** if breach involves processor systems: `security@kiorly.com` + on-call Slack.
5. **Clinic controller** leads PDPC and patient communication with DPO and Legal.

## Escalation — statutory timelines

| Step | Deadline | Owner |
|------|----------|--------|
| Notify **PDPC** | **72 hours** from becoming aware | Clinic DPO + Legal |
| Notify **data subjects** | **3 days** where PDPL requires | Clinic DPO |
| Kiorly processor notice to controller | Without undue delay | Platform security |

Use PDPC’s official breach channel when filing is live; keep filing references in `platform/pdpc-egypt-filings.json`.

**Aftercare:** Post-incident review, update [RECORDS_OF_PROCESSING_EG.md](../RECORDS_OF_PROCESSING_EG.md), retrain staff, evidence in governance module.