# Rate limiting, WAF, secrets hygiene (SC-06)

## Code gates (shipped)

- **Rate limit** — `PublicAuthRateLimitGuard` on `/auth/*` (login 20/min, OTP 10/min, other public auth 30/min per IP). Returns `429 RATE_LIMITED`.
- **Secrets hygiene** — `platform/secrets-hygiene.node.test.ts` fails CI if AWS/Stripe/GitHub live secrets or private key PEM appear under `apps/*/src`, `infra`, `platform`.
- **WAF intent** — `platform/waf-rules.json` (rate-based + AWS managed rule sets for CloudFront). Wire in infra CDK on deploy.

## Human / ops

- External penetration test before Gate 2 — tracked as **NH-017**.
- Run `npm run audit:prod` (`scripts/npm-audit-prod.sh`) before Gate 2; high/critical production dependency CVEs block launch.

## Tests

- `common/rate-limit.node.test.ts`
- `platform/secrets-hygiene.node.test.ts`
