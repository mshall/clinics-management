# FD-02 · ETA removed from product

| Status | Complete — Kiorly does not submit to any tax authority; clinics issue their own receipts |
|--------|-------------------------------------------------------------------------------------------|

## Shipped (full removal)

- Deleted fiscal/ETA modules, workers, public callbacks, device APIs, and provider fiscal registry from runtime code (DB tables retained read-only).
- Single revenue path: `postRevenue` + `void-revenue-adjustments`; no fiscal queue.
- Web: no ETA settings, banners, queues, or fiscal device flows; golden E2E is book → check-in → visit → Rx → split pay → cash close → doctor revenue.
- Printouts are clinic payment records only (no tax-authority wording in product).
- Tests: `revenue-single-path.node.test.ts`, `fd02-no-eta-outbound.node.test.ts`.

## Human

- NH-002 closed: payment slip wording confirmed as clinic payment records outside tax authority integration.