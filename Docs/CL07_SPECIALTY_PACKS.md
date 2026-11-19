# CL-07 — Specialty packs (dental, aesthetics, physio)

Paid add-ons (off on all base plans):

| Entitlement | Features |
|--------------|----------|
| `pack_dental` | Odontogram `DentalChartTooth` + treatment notes / per-tooth fee |
| `pack_aesthetics` | Before/after photo pairs (`ClinicalPhotoKind` BEFORE/AFTER + `pairGroupId`) |
| `pack_physio` | Physio session series via `AppointmentSeries` |

## Purchase

`GET /billing/addons` · `POST /billing/addons/purchase` `{ entitlementKey }` → tenant entitlement override `true` (audited). Same catalog listed at `GET /clinical/specialty-packs/addons`.

## Clinical API

- `GET/PUT /clinical/patients/:id/dental-chart` (`@RequiresEntitlement("pack_dental")`)
- `GET /clinical/patients/:id/before-after` (`pack_aesthetics`)
- `POST /clinical/physio-plans` (`pack_physio`)

## Migration

`20261119250000_cl07_specialty_packs`
