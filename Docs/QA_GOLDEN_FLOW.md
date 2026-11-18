# QA-01 Golden-flow E2E (Playwright)

| Item | Status |
|------|--------|
| Launch definition-of-done E2E | **Done** |

## Scope

End-to-end coverage of the Egypt clinic money + visit path:

1. Book appointment  
2. Check-in with **InstaPay** (transfer reference)  
3. Open encounter / visit  
4. Prescribe drug from **Egypt drug catalog**  
5. Finalize encounter  
6. **Split payment** (cash + card) with ETA queue  
7. **Cash close** shift  
8. **Doctor statement** — finalized encounter (physician UI) + revenue ledger (finance UI)

Variants:

| Variant | Spec |
|---------|------|
| Default org (EN + UI) | `apps/web/e2e/qa01-golden-flow.spec.ts` |
| Arabic UI shell | `qa01-golden-flow.spec.ts` (`locale: ar-EG`) |
| Lite sales pilot | same file (`SEED_PILOT_TENANTS=true`) |
| Kiorex booking + scheduled deposit | `bookingSource: KIOREX_MARKETPLACE` + `scheduledFeeCollection` |

Shared helpers: `apps/web/e2e/golden-flow-helpers.ts`.

## CI

Runs on **every pull request to `main`** in the reusable **CI test** job (after API integration tests):

- Seeds with `SEED_PILOT_TENANTS=true` for Lite pilot users  
- `npx playwright install chromium` then `npm run test:e2e -w web`  
- Playwright starts **`scripts/playwright-ci-webserver.sh`** (API + web only; DB already migrated/seeded in the job) with a **6 min** webServer timeout on cold Nest compile.  
- Failures block merge (required check: **CI test**)

Local:

```bash
npm run db:ensure
SEED_PILOT_TENANTS=true npm run db:seed -w api   # optional Lite variant
npm run test:e2e -w web
```

Or use `npm run dev:e2e` with the stack already up and `PLAYWRIGHT_NO_SERVER=1`.

## Tests

- `qa01-golden-flow.spec.ts`  
- Lite pilot uses **PRO trial** entitlements (`SubscriptionStatus.TRIALING` + `trialPlanId=PRO`) so front-desk + ETA paths match production Lite→Pro upsell.
- Existing smoke specs under `apps/web/e2e/` (auth, RBAC, scheduling, theme, responsive)

## Follow-ups

- Full UI-driven check-in (InstaPay fields) instead of API check-in for the default path  
- Marketplace **HTTP** booking variant (HMAC `/marketplace/v1/bookings`) instead of staff book with `KIOREX_MARKETPLACE` source  
- Parallel-safe unique patients per worker (today: serial `describe` + demo data)