# Sales kit (GT-05)

| | |
|---|---|
| **Status** | **Done** |
| **Step** | 099 · GT-05 |
| **Depends on** | QA-06 pilots, ON-07 reps, CR-09 referrals |

## What shipped

- **Demo reset API:** `POST /api/v1/admin/platform/demo/reset` `{ tier?: "lite"|"pro"|"clinic"|"all" }` — wraps QA-06 pilot reset; acceptance test asserts **&lt; 60 s**.
- **CLI (unchanged):** `npm run demo:reset -- --tier=pro`
- **ROI calculator:** no-shows + admin time + Kiorex patients vs plan — `POST /api/v1/rep/roi` and `POST /api/v1/admin/platform/sales/roi`
- **Rep QR:** `GET /api/v1/rep/me` returns `signupUrl` (`/signup?rep=<salesRepCode>`) + `qrDataUrl` PNG; shown on the rep console.

## Tests

- `gt05-sales-kit.node.test.ts`
- `gt05-sales-kit.integration.test.ts` (reset &lt; 60s + QR)
