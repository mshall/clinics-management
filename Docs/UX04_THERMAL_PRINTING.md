# UX-04 — Thermal printing & accessibility

| | |
|---|---|
| Status | **Done** |
| Templates | 80 mm queue ticket + payment receipt (`THERMAL_80` / 226.77 pt) via `billing-platform/thermal-templates.ts`; Z-report already thermal (MN-03) |
| Printers | Epson TM-T20III + Star TSP143III profiles (clinic `providerSettings.thermalPrinterProfileId`) |
| UI | Admin → org billing → Thermal printing; `GET/PUT /front-desk/print-settings`, print PDFs under `/front-desk/print/*` |
| A11y | WCAG AA muted contrast + global `:focus-visible` ring |

Acceptance: unit gate asserts both profiles emit 80 mm MediaBox PDFs.
