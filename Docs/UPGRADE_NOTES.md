# Upgrade notes: toolchain and dependency refresh (20 Nov 2026)

Branch `kiorex`. One logical group per commit (toolchain, TypeScript, lint/test tooling, backend libs, Prisma 7, NestJS 12, frontend, Vite 8, Tailwind 4, audit). Nothing was pushed, deployed or applied.

## Versions, before and after

| Area | Before | After |
|---|---|---|
| Node.js | 22 (Docker, CI), no `.nvmrc` | **26 LTS** (`.nvmrc`, `node:26-bookworm-slim`, CI `setup-node` 26); `engines` node >= 24, npm >= 11 |
| npm | 10/11 | 11.20 |
| Lambda runtime / images | `nodejs22.x`, `lambda/nodejs:22` | `nodejs24.x`, `lambda/nodejs:24` (Node 26 is preview-only on Lambda, see Pins) |
| TypeScript | 5.7 | **6.0.3** |
| NestJS (+ config, jwt, passport, swagger, CLI, schematics) | 10 / 3 / 10 / 10 / 7 | **12** (Express 5) |
| Prisma (client + CLI) | 6.19 | **7.10** + `@prisma/adapter-pg` 7.10 |
| zod | 3 | 4 (API; unused copy removed from web) |
| openid-client / jose | 5 / 4 | 6.9 / 6 |
| bcryptjs / class-validator / dotenv | 2 / 0.14 / 16 | 3 / 0.15 / 18 |
| AWS SDK v3 | 3.1045 to 3.1172 | 3.1173 |
| React / react-dom | 18.3 | **19.3** |
| Vite / plugin-react | 6 / 4 | **8** (Rolldown) / 6 |
| Tailwind / tailwind-merge | 3.4 / 2 | **4.3** / 3.7 |
| Radix, TanStack Query, react-router, Sonner, Zustand | 1.x / 5.62 / 7.1 / 2.0.7 / 5.0 | latest (dialog 1.3, query 5.108, router 7.18) |
| Recharts / lucide-react / i18next / react-i18next | 2.15 / 0.469 / 24 / 15 | 3.11 / 1.77 / 27 / 18 |
| ESLint / @eslint/js / react-hooks plugin / typescript-eslint | 9 / 9 / 5 / 8.18 | 10 / 10 / 7 / 8.73 |
| Playwright / fast-check | 1.49 / 3 | 1.65 / 4 |
| aws-cdk-lib / aws-cdk / constructs | 2.170 | 2.277 / 2.1149 / 10.8 |
| GitHub Actions | checkout v6, setup-node v6, cache v4, download-artifact v7, github-script v7, setup-opentofu v1, setup-tflint v4, trivy 0.28.0 | checkout v7, setup-node v7, cache v6, download-artifact v8, github-script v9, setup-opentofu v2, setup-tflint v6, trivy 0.36.0 (upload-artifact v7, buildx v4, configure-aws-credentials v6 were already current) |
| OpenTofu AWS provider | `~> 6.0` (locked 6.73) | unchanged: constraint still correct, lock is already the latest 6.73.0; `tofu validate` passes in all four roots |
| `npm audit` | n/a | **0 vulnerabilities** (see Overrides) |

## Migration log (what changed in code, and why)

- **TypeScript 6**: `moduleResolution: node` (field-visit) became `bundler`; `baseUrl` removed from the API tsconfig (paths are now relative); `types: ["node"]` added to infra. TS 6 turns `strict` on by default, so two spots were fixed properly: `main.ts` imports `compression` as a default import, and the `TemplatePrisma` seed helper type uses method syntax.
- **Prisma 7**: `url` left `schema.prisma` (it lives in `prisma.config.ts`); every client now needs a driver adapter. `apps/api/src/prisma/create-prisma-client.ts` builds the `PrismaPg` adapter from the Prisma-style `DATABASE_URL` (`schema`, `connection_limit` become adapter options, `sslmode=no-verify` stays for `pg`, 10 s connect timeout like v6) and loads `.env` (Prisma no longer does). `PrismaService`, seeds, scripts and 114 tests use it (`createPrismaClient()`); `Dockerfile.seed` COPYs it and installs `prisma@7.10.1`. The generator stays `prisma-client-js` (see Pins). Verified: all 179 migrations apply to an empty database and `prisma migrate diff` reports no drift.
- **NestJS 12**: no source changes needed beyond the above; the API boots, logs in and serves OpenAPI unchanged (`openapi.json` and generated web types show no diff).
- **openid-client 6** (functional API): `kiorex-oidc.port.ts` rewritten (discovery, `buildAuthorizationUrl`, `authorizationCodeGrant`, `ClientSecretBasic`, `allowInsecureRequests` for the plain-http dev IdP only). Smoke-tested against the running dev Passport (discovery, authorization URL, error path). The full code exchange was then verified end to end (20 Nov 2026, headless Chromium): Kiorly `Sign in with Kiorex Passport` -> Passport phone + OTP -> `/auth/kiorex/callback` -> logged in as the linked Nurse user (`/home-visits/today`).
- **zod 4**: `ZodIssueCode.custom` became `"custom"`. Web did not import zod, react-hook-form or `@hookform/resolvers`, so those three were removed from `apps/web`.
- **React 19 / Recharts 3 / i18next 27**: tooltip formatters and the pie label use the new Recharts types; i18next 27 only has a `(key, default, options)` overload with required options, so pure helpers take `TranslateFn` / `TranslateLookupFn` (`apps/web/src/lib/translate-fn.ts`) instead of an ad-hoc `t` shape.
- **Vite 8**: `__dirname` replaced by `import.meta.dirname`; the docs app no longer needs the explicit rollup native package.
- **Tailwind 4**: ran `@tailwindcss/upgrade` (CSS entry now `@import "tailwindcss"` with `@config` for the existing preset, PostCSS plugin swapped). The tool also renamed the string `"outline"` to `"outline-solid"` in 85 Button/Badge `variant` props; those were reverted by hand. Two theme selectors that matched the old `shadow-sm` class were moved to `shadow-xs`.
- **ESLint 10**: one `no-useless-assignment` fix. The React Compiler rules that arrived with `eslint-plugin-react-hooks` 7 (`set-state-in-effect`, `refs`, `purity`, ...) flag about 140 existing places; they are enabled as **warnings** in `apps/web/eslint.config.js` (rules-of-hooks stays an error). Burn them down and promote them to errors later.
- **Tests fixed**: `kx02-provider-profile` resync now pages through every provider (it assumed fewer than one page); the HVSAF01 safety drill drains leftover visits from other seeds first (the safety clock is global); the Reports e2e opens the Charts tab (stale since the Reports tab reorganisation).

## Overrides (root `package.json`)

| Override | Why | Remove when |
|---|---|---|
| `react`, `react-dom` `^19.3.1`, `@types/react(-dom)` `^19.3.0` | Prisma's studio-core peer range (`^18 \|\| ^19`) otherwise hoists React 18 types/runtime next to the app's React 19 | Prisma studio-core drops the React 18 peer or the hoisting no longer happens |
| `openapi-typescript` -> `typescript ~6.0.3` | Peer is `^5.x`; codegen works on 6 (output unchanged) | openapi-typescript publishes TS 6 support |
| `effect ^3.22.5`, `glob ^14.0.6`, `minimatch ^11.0.9` | Clear 3 high and 6 moderate advisories (effect ReDoS via `@prisma/config`, glob/minimatch via workbox-build and readdir-glob) | Prisma, workbox-build and readdir-glob ship patched ranges themselves |

## Pinned or blocked

| Item | Pinned at | Why | What unblocks it |
|---|---|---|---|
| TypeScript 7 (native) | 6.0.3 | typescript-eslint 8.73 supports `<6.1`, openapi-typescript peers `^5`, Nest CLI and Prisma use the JS compiler API | typescript-eslint and the Nest CLI supporting TS 7 |
| Lambda runtime Node 26 | `nodejs24.x` | Node 26 on Lambda is public preview (not for production); CDK has no `NODEJS_26_X` constant | Lambda GA for Node 26, then bump `jobs.tf`, the CDK stack and `Dockerfile.seed` / `db-backup` |
| Prisma generator | `prisma-client-js` | `prisma-client` requires an explicit output dir and rewriting every `@prisma/client` import; the old generator still works in 7 | Dedicated migration task (or when `prisma-client-js` is removed) |
| Postgres 16 (compose, CI service, RDS `engine_version = "16"`) | 16 | KX-01 binding stack, and a major engine upgrade is an infra decision | Founder decision plus an RDS upgrade plan |
| Redis 7 image (CI service) | 7 | not part of this refresh | n/a |
| `react-hooks` compiler rules | warnings | ~140 findings, behaviour-neutral refactors | Dedicated clean-up |

## Operational notes

- **Install scripts**: npm 11.20 prints `install-scripts` warnings (packages whose lifecycle scripts are not allow-listed). Nothing needs them: `prisma generate` is run explicitly by the build scripts and esbuild/rolldown ship prebuilt binaries.
- **Prisma 7 pooling**: pool defaults now come from `pg`. `connection_limit` in `DATABASE_URL` caps the pool; without it the pool is `DB_POOL_MAX`, else 10 (explicit default, `resolvePoolMax`; Prisma 6 used num_cpus*2+1) (the shared dev cluster has `max_connections = 100`, keep it small when several agents run tests).
- **dotenv 18** logs a tip on load; the Prisma entry points call it with `quiet: true`.
- **No vendored contracts tarball lives in this repo** (`@kiorex/contracts` is consumed from the kiorex-contracts repo); its recipe was not touched.
- **Do not run `npx ncu`**: it resolves to an unrelated package. Use `npx npm-check-updates`.

## Verification (Node 26.13.1, scratch databases on the shared 5433 cluster)

`npm ci` from clean; typecheck (field-visit, API, web, docs, infra); API unit 795/795; web unit 67; field-visit 48; infra 5; API integration 370/370 (against a demo-seeded DB); money-path coverage 90 % lines; OpenAPI export and web codegen show no diff; `npm run synth` (CDK) passes; `tofu validate` and `tofu fmt -check` pass; Playwright (`chromium`, `mobile-chrome`, `tablet`, `nurse-open`, `nurse-gated`) all green after the Reports spec fix; `npm audit` 0.
