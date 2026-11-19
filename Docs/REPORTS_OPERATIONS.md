# Operational KPIs (RP-01)

`GET /api/v1/reports/operations?from=&to=&clinicId=&period=YYYY-MM`

| KPI | Definition |
|-----|------------|
| No-show rate | `NO_SHOW / (COMPLETED + NO_SHOW)` overall and by doctor / type / day |
| Utilisation | booked minutes / available minutes (8h × clinicians × days fallback) |
| Revenue per doctor-hour | posted revenue ÷ (booked minutes / 60) |
| New vs returning | `isNewPatientAtBooking` |
| Booking sources | mix including `KIOREX`, `CLINIC_LINK`, front desk |

Entitlement: `mod_reports`. UI: Reports → Operations KPIs card.

Tests: `rp01-operations-kpis.node.test.ts`, `rp01-operations-kpis.integration.test.ts`.
