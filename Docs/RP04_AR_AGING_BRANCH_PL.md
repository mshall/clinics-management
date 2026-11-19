# RP-04 — AR aging, payouts and branch P&L

| | |
|---|---|
| Status | **Done** |
| API | `GET /reports/ar-aging`, `/reports/payouts`, `/reports/branch-pl` |
| UI | `/reports/ar-aging` (same page covers branch P&L + payouts) |

Aging buckets from open `ClaimLine` rows per payer; branch P&L sums posted revenue and expenses per clinic and **reconciles** to org billing totals. See reports tests `rp04-ar-aging.*.test.ts`.
