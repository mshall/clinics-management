# CL-06 — Lab & radiology orders as records

First-class `ClinicalOrder` / `ClinicalOrderItem` rows (LAB | IMAGING) with statuses through `RESULTS_READY`.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/clinical/orders?encounterId=&patientId=` | List |
| POST | `/clinical/orders` | Create ORDERED with items |
| PATCH | `/clinical/orders/:id` | Status / results; **RESULTS_READY** queues WhatsApp `results_ready` |

## Acceptance

Results ready → WhatsApp template `results_ready` (consent + quota checked via MessagingService).

## UI

Encounter detail → **Lab & imaging orders** panel (EN/AR).

## Migration

`20261119240000_cl06_clinical_orders`
