# CI patch: security, edge-case, bundle and browser suites (ready to apply)

Status: **proposed, not applied.** The founder owns `.github/` in this repository (a push to `kiorex` can trigger a deploy workflow), so this file only describes the change. The test commands were run locally on 24 Nov 2026 (results in the table); the YAML itself has not been executed on GitHub, and the preview-server start-up in section 2 was not exercised.

Target file: `.github/workflows/ci-test-reusable.yml` (the reusable gate, called by `ci-test.yml` for pull requests to `main`). The jobs below are additions; nothing existing changes. Use the same Postgres service, env block and `./.github/actions/setup-node-deps` step as the existing job.

## 1. What each suite proves

| Job | Command (cwd = repo root) | Needs | Local result 24 Nov 2026 |
|---|---|---|---|
| API unit incl. security and ratchets | `npm run test:unit -w api` | nothing | 1,252 tests; 1 failure is cross-repo drift (see section 4) |
| API integration (edge, marketplace, DTO ratchets, Kiorex) | `npm run test:integration -w api` | Postgres, seeded `db:seed`, `db:seed:demo`, `db:seed:mobile` | 457 of 457 |
| Free-form body ratchet | included in `test:unit` (`src/common/inline-dto-coverage.node.test.ts`) | nothing | pass |
| Web production bundle hygiene | `npm run check:dev-test-users -w web` | nothing (builds twice, about 1 minute) | OK: no dev panel, no local address in production |
| Sign-in edge, Growth, Kiorex tab (Chrome) | `npx playwright test -c playwright.signin.config.ts` etc. in `apps/web` | running API and web | green in the EDGE 2026-11 round against the dev stack; not re-run in this round |

## 2. Patch for `.github/workflows/ci-test-reusable.yml`

Add two inputs next to the existing ones:

```yaml
      run_bundles:
        description: Production-bundle hygiene (no dev-only feature, no localhost)
        type: boolean
        required: false
        default: true
      run_web_e2e_edge:
        description: Sign-in default method, edge widths and the Kiorex tab (Playwright, system Chrome)
        type: boolean
        required: false
        default: true
```

Add these steps to the existing `ci_test` job, after "Unit tests (api)":

```yaml
      - name: Security + edge unit specs on their own (fast signal; they also run in the full unit step)
        if: ${{ inputs.run_api_unit }}
        run: >-
          node --import tsx --test
          "src/common/inline-dto-coverage.node.test.ts" "src/common/bounded-json.node.test.ts"
          "src/**/*security*.node.test.ts" "src/**/*edge*.node.test.ts"
        working-directory: apps/api

      - name: Production bundle: no dev-only feature, no localhost (web)
        if: ${{ inputs.run_bundles }}
        run: npm run check:dev-test-users -w web
```

Add this step after "E2E golden flow (Playwright)" (the API and web are already built by the preceding "Build API and web for E2E" step):

```yaml
      - name: Sign-in default method + edge cases + Kiorex tab (Playwright, system Chrome)
        if: ${{ inputs.run_web_e2e_edge }}
        run: |
          (cd apps/api && PORT=3010 NODE_ENV=development SIGNIN_DEFAULT_METHOD=PASSWORD nohup node dist/src/main.js > ../../api.log 2>&1 &)
          (cd apps/web && nohup npx vite preview --host 127.0.0.1 --port 5174 --strictPort > ../../web.log 2>&1 &)
          for i in $(seq 1 90); do curl -fs localhost:3010/api/v1/health/ready >/dev/null && curl -fs 127.0.0.1:5174/ >/dev/null && break; sleep 1; done
          cd apps/web
          SIGNIN_BASE_URL=http://localhost:5174 npx playwright test -c playwright.signin.config.ts
          KIOREX_TAB_BASE_URL=http://localhost:5174 npx playwright test -c playwright.kiorex-tab.config.ts
        env:
          SEED_PILOT_TENANTS: "true"
          SWAGGER_ENABLED: "false"
```

Notes for the person applying it:

* `vite preview` proxies `/api` to the API port the same way the dev server does (see `apps/web/vite.config.ts`); if the preview proxy is not configured in your fork, use `npx vite --host 127.0.0.1 --port 5174` instead.
* The Playwright configs with `channel: "chrome"` use the Google Chrome that is preinstalled on `ubuntu-latest`; `npx playwright install chromium --with-deps` (already in the job) is only the fallback for the golden flow.
* The Growth workspace spec (`playwright.growth.config.ts`) needs a seeded KX-DEV tenant with a booking slug; it stays a local suite until the CI seed contains that tenant.
* Upload `apps/web/test-results` with `actions/upload-artifact` on failure, as the other repos do.

## 3. Why these belong in the required check

* The DTO ratchets fail the build when a controller gets a new inline-typed or `Record<string, unknown>` body, which is how the "never a 5xx on bad input" guarantee (EDGE 2026-11, defect 22) stays true after the next feature.
* The bundle check is the only automatic guard that the DEV ONLY quick-pick panel, its synthetic logins and any `localhost` URL stay out of production builds. It found a real leak on 24 Nov 2026 (the Kiorly Home fallback URL was kept by the bundler); it is fixed.

## 4. Known red item that is not Clinic's fault

`src/feature-flags/ff01-registry.node.test.ts` "matches kiorex-contracts flags/catalogue.json" fails while `kiorex-contracts` 1.12.0 lists the flag `growth.provider_marketing_v2` and the Clinic registry (`feature-flags/`) does not define it yet. The fix belongs to the Growth Phase 2 work that introduced the flag (define it in `CLINIC_FLAG_DEFINITIONS`, or add it to `PENDING_CONTRACT_FLAG_KEYS` until the contracts tarball is vendored). It will block a pull request that includes both repos' latest state until then.
