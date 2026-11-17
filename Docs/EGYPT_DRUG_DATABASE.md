# CL-01 — Egyptian drug database (brand → active ingredient)

**Status:** Shipped (demo catalog + import pipeline). **Production** requires a **licensed** national drug dataset from your vendor or the official registry.

## Data model

| Model | Purpose |
|-------|---------|
| `ActiveIngredient` | Generic name (EN unique), optional AR, ATC |
| `DrugProduct` | Brand, form, strength, pack, manufacturer, registration, sigs, `marketId`, `datasetVersionId` |
| `DrugProductIngredient` | M:N with per-ingredient strength |
| `DrugDatasetVersion` | Version label, source name, licence note, active flag |
| `ClinicianDrugProductUsage` | Per-doctor frequency for search ranking |
| `EncounterMedication.drugProductId` | Nullable link; `drugUnverified=true` when free-text only |

Migration: `20261117190000_cl01_egypt_drug_catalog` (enables `pg_trgm` + GIN indexes).

## APIs

| Method | Path | Role |
|--------|------|------|
| `GET` | `/api/v1/clinical/drugs/search?q=&limit=` | Clinicians — prefix + fuzzy (AR/EN), clinician usage boost |
| `POST` | `/api/v1/admin/platform/drug-datasets` | Platform super admin — import JSON version |
| `GET` | `/api/v1/admin/platform/drug-datasets?marketCode=` | List versions |

Encounter Rx: `POST /encounters/:id/medications` accepts optional `drugProductId`.

## Demo seed

`ensureEgyptDrugCatalog` in `apps/api/prisma/egypt-drug-catalog-seed.ts` loads **Augmentin** → amoxicillin + clavulanic acid and ~650 synthetic rows for search perf tests. **Not** a substitute for a licensed formulary.

## UI

- Encounter medications: **DrugSearchAutocomplete** (brand, form, strength, ingredients; suggests default sig).
- Unverified free-text rows show an **Unverified** badge.
- Platform → **Drug datasets** — paste products JSON array for import.

## Safety / interactions (CL-02)

`POST /clinical/rx/check` — ingredient-level allergy, interaction, and duplication alerts. See [CLINICAL_RX_SAFETY.md](./CLINICAL_RX_SAFETY.md).

## Tests

- `drug-catalog.node.test.ts` — Augmentin alias fallback
- `drug-catalog.integration.test.ts` — DB ingredient resolution + search p95 &lt; 100 ms

## Follow-ups

- License and import production Egyptian drug database (EDA / commercial vendor).
- Scheduled delta imports and audit per version.
- Operation medications parity (`OperationMedication.drugProductId`).
- ATC-based interaction rules tied to ingredients.