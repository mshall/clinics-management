# CL-02 — Rx safety by ingredient

| Item | Status |
|------|--------|
| CL-02 Ingredient interactions, allergies, duplication | **Done** |

## Checks

- **Drug–drug:** `DrugInteractionRule` pairs keyed by `ingredientA` / `ingredientB` (severity: minor, moderate, major, contraindicated).
- **Drug–allergy:** `PatientAllergy` codes mapped to ingredient/class tokens.
- **Therapeutic duplication:** same active ingredient across two Rx lines in the check batch.
- **Free-text** (no `drugProductId` and no catalog match): `unavailable` alert — safety check not performed on ingredients.

Starter interaction set lives in `clinical-default-catalog.ts` (advisory board review before production).

## API

| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/v1/clinical/rx/check` | `{ patientId, items: [{ drugName, drugProductId? }] }` → `{ alerts, hasUnverifiedItems }` |

Legacy: `POST /clinical/medications/safety-check` (single pending line).

## Save

`POST /encounters/:id/medications` accepts `safetyOverrideReason` when alerts have `requiresOverride` (major / contraindicated).

Stored on `EncounterMedication.safetyOverrideReason`; audited as `RX_SAFETY_OVERRIDE`.

## UI

Encounter → clinical tools and medication entry: severity-coloured alerts (EN/AR). Override reason field before Add medication.

## Tests

- `cl02-rx-safety.node.test.ts` — severity, allergy ingredient match, free-text unavailable
- `cl02-rx-safety.integration.test.ts` — override stored + audit row

## Follow-ups

- Licensed national interaction feed (replace starter rules).
- Operation medications parity.
- ATC-class rules from `ActiveIngredient.atcCode`.