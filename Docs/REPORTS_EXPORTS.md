# Report exports & scheduled delivery (RP-02)

## API

- `GET /api/v1/reports/:key/export?format=xlsx|pdf&from=&to=&clinicId=`
  - Keys: `profit-loss`, `performance`, `operations`, `payments`, `clinic-breakdown`, `monthly-series`, `patient-acquisition`
  - **Payments** rows: date, patient, MRN, service, amount, currency, method, reference
  - Money-bearing keys require money visibility (operations override) + reports RBAC (`mod_reports` + nav tab). Denied → `403 MONEY_VISIBILITY_DENIED`
- `GET/PUT /api/v1/reports/schedule` — weekly owner delivery (email + WhatsApp) of export links

## Formats

- **xlsx**: SpreadsheetML 2003 (`.xls`, Excel/LibreOffice)
- **pdf**: minimal PDF listing rows

## Scheduler

`messaging/ScheduledReportsService` ticks every minute; on the configured ISO weekday + local hour it emails (`weekly_report`) and WhatsApps (`owner_scheduled_report`) owners once per ISO week (`DigestSendLog` kind `scheduled_report`).

## UI

Reports → export buttons (payments Excel/PDF, operations & performance Excel).

## Tests

- `rp02-report-export.node.test.ts`
- `rp02-report-export.integration.test.ts`
