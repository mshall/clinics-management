# QA-07 · Load & device performance tests

| Status | Artefacts + CI gates done — staging k6 + device Lighthouse is **NH-020** |
|--------|--------------------------------------------------------------------------|

## Slots SLO

- **p95 < 150 ms at 50 rps** on marketplace slots.
- Engine unit gate: `kx03-slot-performance.node.test.ts` (serial + 50-way concurrent).
- HTTP load:
  - k6: `perf/k6/marketplace-slots-bookings.js` (`rate: 50`, threshold `p(95)<150`)
  - Node: `npm run test:perf:slots` → `scripts/load-test-marketplace-slots.mjs`

## Device / Lighthouse

- Mid-range Android 4G profile: `perf/lighthouse/mobile-4g.json` (360×640, Slow 4G simulate, 4× CPU).
- Budget: `perf/lighthouse/budget.json` — **interactive (TTI) ≤ 4000 ms**.
- Check: `npm run test:perf:lighthouse` (validates artefacts; set `LH_URL` + install `lighthouse` for a live audit).

## Human / ops

- Run k6 against staging with real marketplace HMAC + clinic fixtures; run Lighthouse against the production-like web origin on a mid-range Android or emulated 4G — **NH-020**.
