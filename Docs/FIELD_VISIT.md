# Field visit package and API port (KCV206)

Status: **package extracted and wired behind an interface (part 1); the home-visit feature (HVCFG/HVBK/HVPRV/HVEXE/HVSAF/HVFEE/HVRPT) is built on it (part 2): see [HOME_VISITS.md](./HOME_VISITS.md).** The package gained the `UNSAFE_ABORT` alert kind; `FieldVisitPort.deliverSafetyAlert` takes the organisation safety contact per call.
Gates GHV1 (counsel memo) and GHV2 (CMO-signed safety protocol) are human gates and are **not recorded**; `clinic.home_visits` stays launch-locked.

| Piece | Where |
|---|---|
| Package `@kiorly/field-visit` 0.1.0 | `packages/field-visit` (README there) |
| Safety-drill suite | `packages/field-visit/src/safety-drill.test.ts` (`npm run test:drill -w @kiorly/field-visit`) |
| API port + implementation | `apps/api/src/field-visit/` (`FieldVisitPort`, `FIELD_VISIT_PORT`, `FieldVisitService`) |
| Mock safety-alert channel | `MockSafetyAlertDispatcher` (dev inbox SMS, no PHI); real path fails closed until **PG-13** |
| Market-pack districts | `Market.clinicalConfig.districts` validated by `districtsFromMarket()` (no default list shipped; content decision) |

Safety controls (address masking, safety timer, SOS, unsafe-abort) are not feature flags: `home_visit_safety` is registered in
`feature-flags/safety-controls.ts` and `ff-safety-never-flags.node.test.ts` fails if flag gating appears in `field-visit/`.

## Protocol constants (HVSAF01/02, BR52/53/61)

Prompt 30 min after planned end · alert to the organisation safety contact 10 min later without an answer · alert delivered ≤ 60 s after it is due ·
SOS shares live location and shows 123 / 122 · address masked 24 h after the visit · geostamps coarse (~1 km), 12 months then district only.
The constants are CMO-protocol territory (GHV2): this change implements the KX-05 text, a clinician-signed protocol may tighten them via a package release.

## Build and CI wiring

`@kiorly/field-visit` compiles to `dist/` (tsc). Root `typecheck`, `build`, `test:unit`, `test:integration` and the api's `predev`,
`pretest:unit`, `pretest:integration`, `typecheck`, `build` scripts build it first. `apps/api/Dockerfile` and `Dockerfile.seed` copy
`packages/field-visit/package.json` (npm ci needs the workspace manifest) and the runner image copies the built `dist`.

## Home visits (done) - how they use the port

Depend on `FIELD_VISIT_PORT`, not the package. Persist `FieldVisit` snapshots yourself (`HomeVisit` table, encrypted `addressSnapshot`), run
`evaluateSafetyTimer` from a scheduler with a tick ≤ 15 s (the SLA budget in the drill assumes it) and use `FieldVisitService.defaultDispatchers(tenantId, contact)`.
