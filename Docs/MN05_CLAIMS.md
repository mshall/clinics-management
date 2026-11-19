# MN-05 — Company contracts & TPA claims

| | |
|---|---|
| Status | **Done** |
| API | `/api/v1/claims/*` (`mod_invoices`) |
| UI | `/front-desk/claims` |

Claim batches per payer/period from invoices with `payerCompanyId`, line reject/resubmit, remittance import with auto-match (≥ 90% in fixtures), and INTERNAL outbox `billing.payer_b2b_invoice` (not ETA). See [CLINIC_BILLING.md](./CLINIC_BILLING.md#company-contracts--tpa-claims-mn-05).
