# CL-06 — Lab & radiology orders as records

First-class `ClinicalOrder` / `ClinicalOrderItem` rows (LAB | IMAGING) with statuses through `RESULTS_READY`.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/clinical/orders?encounterId=&patientId=` | List |
| POST | `/clinical/orders` | Create ORDERED with items |
| PATCH | `/clinical/orders/:id` | Status / results; **RESULTS_READY** queues WhatsApp `results_ready` |

| POST | `/clinical/orders/:id/results-pdf` | Attach the results as a PDF (multipart `file`, %PDF- checked, max 15 MB); stored privately under the tenant, key in `resultsPdfRelativePath` |
| GET | `/clinical/orders/:id/results-pdf` | Stream the PDF back (tenant-scoped) |
| POST | `/clinical/orders/:id/handoff` | KCV204 (`clinic.lab_order_handoff`): hand a LAB order to Kiorly Lab via Kiorex; emits `LabOrderPlaced` with the patient's LAB_RESULTS consent token; idempotent per order |

Structured results live on the items (`resultValue/unit/flag`) and `resultsJson`; the PDF is the signed report copy.

## Acceptance

Results ready → WhatsApp template `results_ready` (consent + quota checked via MessagingService).

## UI

Encounter detail → **Lab & imaging orders** panel (EN/AR).

## Migration

`20261119240000_cl06_clinical_orders`
