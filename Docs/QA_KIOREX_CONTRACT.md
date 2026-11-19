# QA-04 · Kiorex marketplace contract tests

| Status | Done in Kiorly — Kiorex consumer CI wiring is **NH-019** |
|--------|----------------------------------------------------------|

## Source of truth

- OpenAPI: `apps/api/openapi/marketplace.openapi.json`
- Consumer pin file: `apps/api/openapi/kiorex-consumer-contract.json` (required paths, methods, operationIds, HMAC headers, slot query params, booking channel enum)

## CI gates (this repo)

`apps/api/src/marketplace/qa04-marketplace-openapi.node.test.ts` fails when:

1. A required operationId / path / method is removed or renamed.
2. Nest `MarketplaceController` routes drift from the OpenAPI paths.
3. HMAC auth headers are dropped from the controller.
4. Slot required query params or `booking.channel` enum break the consumer pin.

## Consumer-driven (both repos)

Kiorex should copy or fetch `kiorex-consumer-contract.json` + the OpenAPI spec and assert the same required surface in its CI. Until that job exists, track **NH-019**.

## Extending the contract

1. Update Nest controller.
2. Update `marketplace.openapi.json` (and regenerate if you use `openapi:export` for the main API — marketplace stays hand-curated).
3. Update `kiorex-consumer-contract.json` only for intentional consumer-visible changes.
4. Notify Kiorex before merging breaking pin changes.
