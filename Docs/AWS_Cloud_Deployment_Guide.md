# AWS cloud deployment guide

This document describes how the **Clinics Management** monorepo is deployed to **Amazon Web Services** today, and how to run or adapt that setup. It complements the root [`README.md`](../README.md) cost tiers and [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md) architecture notes.

**Repository:** [github.com/mshall/clinics-management](https://github.com/mshall/clinics-management)

**Scope:** The **checked-in CDK stack** (`infra/`) — not a generic ECS tutorial. For PHI/PII and regional regulations, perform your own compliance review.

**Live tenant caution (Dr Ahmed Shall Group):** Deploys from `main` must not wipe RDS rows or empty the **uploads S3** bucket. Post-deploy seed is **incremental ensure-only**. See `.cursor/rules/aws-deploy-data-safety.mdc`.

**Path-scoped deploys (`.github/workflows/deploy-aws.yml`):** pushes to `main` are classified by `scripts/detect-deploy-scope.sh` into `web` (SPA S3 + CloudFront only), `api` (CDK/App Runner; current SPA restored from S3), `full` (both), or `skip` (docs-only). Web-only never rebuilds the API image or touches **ApiUploadsBucket**. Manual override: workflow_dispatch → `deploy_scope`.

---

## 1. What you are deploying

| Component | Artifact | AWS home (current stack) |
|-----------|----------|---------------------------|
| PostgreSQL schema + data | Prisma migrations (`apps/api/prisma/migrations`) | **Amazon RDS for PostgreSQL 16** (private subnets) |
| REST API (`/api/v1`, health at `/api/v1/health/live`) | `apps/api/Dockerfile` → ECR via CDK asset | **AWS App Runner** (VPC egress to RDS) |
| Web SPA | `apps/web/dist` | **S3** origin behind **CloudFront** |
| User uploads (patients, encounters, expenses, HR) | Blob storage abstraction in API | **Amazon S3** (`UPLOAD_STORAGE=s3`, `S3_UPLOAD_BUCKET`) |
| Demo / QA seed on RDS | `apps/api/prisma/seed.ts` | **DbSeedFn** Lambda (post-deploy, idempotent) |

**Single public URL:** CloudFront serves the SPA and proxies **`/api/*`** to App Runner on the **same hostname** (no separate `VITE_API_URL` required in production builds when using this pattern).

**Live demo (after deploy):** CloudFront URL from stack output `AppUrl` — see [`Test_Data_Users.md`](./Test_Data_Users.md) (e.g. `https://d92iz83i79c05.cloudfront.net` when that distribution is active).

---

## 2. Architecture (implemented)

```
Users ──HTTPS──► CloudFront (AppUrl)
                    │
        ┌───────────┴────────────┐
        │                        │
   S3 (SPA assets)         /api/* → App Runner (Nest API)
   + CloudFront Function          │
   (SPA path rewrite)              ├──► RDS PostgreSQL (isolated subnets)
                                  └──► S3 ApiUploadsBucket

CI/CD (push main) ──► CI test + web build ──► cdk deploy ──► DbSeedFn ──► smoke (ready + login)
```

**Design choices in this stack:**
- **Region / cell (SC-01):** default cell **`frankfurt`** in `eu-central-1`; DB timezone `Europe/Berlin`. Optional cell **`cairo`** in `me-south-1` via `KIORLY_HOST_CELL` — see [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md).
- **No NAT gateway** — App Runner VPC connector + **interface VPC endpoints** (Secrets Manager, KMS, STS) to avoid NAT cost.
- **No ALB** — App Runner is the compute target; CloudFront talks to App Runner’s HTTPS URL via a custom resource that parses the origin host.
- **Migrations on boot** — `PRISMA_MIGRATE_ON_BOOT=true` on App Runner; interim health listener in Docker entrypoint during migrate.
- **Seed off boot** — `PRISMA_SEED_ON_BOOT=false` so App Runner stabilizes within deploy timeouts; **`scripts/cicd-post-deploy-seed.sh`** invokes **DbSeedFn** after CDK succeeds.

Source: `infra/src/kiorly-clinics-management-stack.ts`.

---

## 3. Prerequisites

- AWS account; **OIDC** trust for GitHub Actions (see `.github/workflows/deploy-aws.yml` header comments).
- **Node.js 26 (Active LTS)**, **npm**, **Docker** (CDK builds API/seed images).
- One-time: `npx cdk bootstrap aws://ACCOUNT_ID/eu-central-1` from `infra/`.
- GitHub secret **`AWS_DEPLOY_ROLE_ARN`** with permission to deploy the stack and invoke DbSeedFn.

### Second pipeline (Kiorex account / `kiorex` branch)

| Surface | AWS target |
|---------|------------|
| Branch **`main`** | Existing **Kiorly** account (OIDC `AWS_DEPLOY_ROLE_ARN`, local default credentials) |
| Branch **`kiorex`** | Separate **Kiorex** AWS account via local profile **`aws-kiorex-profile`**, or GitHub secrets **`AWS_KIOREX_ACCESS_KEY_ID`** / **`AWS_KIOREX_SECRET_ACCESS_KEY`** |

- Local: `scripts/resolve-aws-profile.sh` selects `aws-kiorex-profile` when the current branch is `kiorex`; `scripts/deploy-aws.sh` and `scripts/cicd-deploy.sh` honor it. Override with `AWS_PROFILE_OVERRIDE=…`.
- CI: **`.github/workflows/deploy-aws-kiorex.yml`** on push to `kiorex` (refuses account `990597228737` so production cannot be overwritten by mistake).
- Do **not** commit access-key CSV files; keep them outside the repo.

---

## 4. Deploy via GitHub Actions (recommended)

Workflow: **`.github/workflows/deploy-aws.yml`** (Kiorly / `main`)

| Trigger | Action |
|---------|--------|
| Push to **`main`** | Build API + web → `cdk deploy` → post-deploy seed |
| **workflow_dispatch** | Same, manual |

Workflow: **`.github/workflows/deploy-aws-kiorex.yml`** (Kiorex / `kiorex`)

| Trigger | Action |
|---------|--------|
| Push to **`kiorex`** | Same deploy path into the Kiorex AWS account |
| **workflow_dispatch** | Same, manual |

Steps (summary):
1. Reusable **CI test** (`ci-test-reusable.yml`) — migrate, typecheck, unit + integration tests (deps via `.github/actions/setup-node-deps`: skip `npm ci` when the lockfile-keyed `node_modules` cache hits). Deploy still runs a fresh host `npm ci` in `cicd-deploy.sh`; container images rebuild with their own `npm ci` and are unaffected by the Actions module cache.
2. **Web build** — `npm run build -w web` (fail fast before CDK).
3. **`scripts/cicd-deploy.sh`** — build API image + web assets, `check:apprunner-connector-cfn`, orphan VPC connector cleanup, `cdk deploy`, `cicd-wait-apprunner-deploy.sh`.
4. **`scripts/cicd-post-deploy-seed.sh`** — invokes **DbSeedFn** (`PRISMA_SEED_ENSURE_DEMO_PASSWORDS=false` on the deployed stack: the seed never re-sets the password of an existing account and creates any missing seeded account with a random unknown password) unless seed already ran in the deploy log.
5. **`scripts/cicd-post-deploy-smoke.sh`** — waits for **`GET /api/v1/health/ready`** (`database: ok`), then signs in with the smoke account and runs the assistant + org users checks. The smoke account comes from the GitHub Actions secrets **`SMOKE_LOGIN_EMAIL`** and **`SMOKE_LOGIN_PASSWORD`** (repository secrets, passed by the deploy workflows); the script fails with a clear message when they are unset and has no published default.

Workflow **`concurrency: cancel-in-progress: true`** — only the latest push to `main` should finish deploy.

PR validation: **`.github/workflows/pr-synth-build.yml`** runs CDK synth without AWS credentials.

---

## 5. Deploy locally (CDK)

From repository root:

```bash
# Frankfurt (production Egypt Path A)
bash scripts/deploy-aws.sh

# Or explicitly:
KIORLY_HOST_CELL=frankfurt AWS_REGION=eu-central-1 bash scripts/deploy-aws.sh

# Prepared Path B (not used for EG production until migration runbook):
KIORLY_HOST_CELL=cairo AWS_REGION=me-south-1 bash scripts/deploy-aws.sh
```

Stack outputs include **`HostCell`** and **`DataRegion`** for residency attestation. RDS and upload buckets are tagged `KiorlyHostCell`.

Note stack outputs:
- **`AppUrl`** — give users this HTTPS URL.
- **`AppRunnerServiceUrl`** — direct App Runner URL (debug only).
- **`DbSecretArn`**, **`DbSeedFunctionName`**.

If CloudFormation stack is **`ROLLBACK_COMPLETE`**, delete the stack in the AWS console before redeploying.

---

## 6. Database (RDS)

- Engine: **PostgreSQL 16**, instance **db.t4g.micro**, **20 GB** gp3 (autoscale to 100 GB).
- **Private** subnets; credentials in **Secrets Manager** (`DB_SECRET_ARN` on App Runner / seed Lambda).
- **Backup retention:** 7 days (stack default).
- **Multi-AZ:** false in cost-optimized stack (enable for production hardening).

**Manual migrate** (bastion or Session Manager port-forward):

```bash
export DATABASE_URL="postgresql://..."   # from Secrets Manager
cd apps/api
npx prisma migrate deploy
```

---

## 7. API container (App Runner)

- **Image:** Built from repo root, `apps/api/Dockerfile`, **linux/amd64**.
- **PID 1:** `apps/api/docker-entrypoint.mjs` — binds **public `PORT` (3000)** immediately, proxies to Nest on **`NEST_INTERNAL_PORT` (3001)** after boot.
- **Nest entry:** `nest build` emits **`dist/src/main.js`** (not `dist/main.js`); the entrypoint resolves that path (see `docker-entrypoint-main-path.node.test.ts`).
- **Ports / probes:**
  - **`GET /api/v1/health/live`** — App Runner health check path. During boot the **proxy** may return `{ status: "ok", phase: "starting" }` **before Nest listens** — do not use live alone for “API is ready”.
  - **`GET /api/v1/health/ready`** — Nest **`HealthController`**: `200` + `{ status: "ok", database: "ok" }` when Prisma can `SELECT 1`. Post-deploy smoke and `npm run sync:aws:smoke` gate on this.
- **CPU / memory:** 1 vCPU, 2 GB (stack default — supports migrate-on-boot).
- **Auto scaling (shipped):** `CfnAutoScalingConfiguration` — **maxConcurrency** 100 per instance, **maxSize** 25 instances (thousands of concurrent API requests via horizontal scale-out).
- **Secrets:** `JWT_SECRET` from Secrets Manager JSON key `jwt`.
- **Environment (non-secret):**

| Variable | Production value (stack) |
|----------|-------------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `SWAGGER_ENABLED` | `false` |
| `DB_SECRET_ARN` | RDS secret ARN |
| `UPLOAD_STORAGE` | `s3` |
| `S3_UPLOAD_BUCKET` | ApiUploadsBucket name |
| `PRISMA_MIGRATE_ON_BOOT` | `true` |
| `PRISMA_SEED_ON_BOOT` | `false` |
| `TZ` | `Europe/Berlin` |
| `SECRETS_MANAGER_VPCE_HOST` / `KMS_VPCE_HOST` / `STS_VPCE_HOST` | VPC endpoint DNS names |

**Optional:** `PLATFORM_SUPER_ADMIN_EMAILS` — comma-separated emails for break-glass org admin tools (data explorer, all-tenants list). Prefer dedicated **`superadmin@kiorly.com`** (`PLATFORM_SUPER_ADMIN` role) for platform operations.

---

## 8. Web SPA (S3 + CloudFront)

Production build is bundled into CDK **`BucketDeployment`** (`apps/web/dist`).

- **Same-origin API:** CloudFront behavior **`/api/*`** → App Runner; SPA uses relative `/api/v1/...` (empty `VITE_API_URL`).
- **SPA routing:** CloudFront **Function** rewrites extension-less paths to `/index.html` **only on the S3 behavior** — not on `/api/*` (prevents API JSON being replaced by HTML).
- **Post-deploy client refresh:** Each web build writes `build-id.json` and sets **`WEB_BUILD_ID`** on App Runner (same commit SHA). The SPA embeds the id in the bundle. **No forced reload loop.** After deploy, the API returns **`X-Kiorly-Web-Build-Id`** on responses; when it differs from the embedded id the app shows a **“New version available”** banner (**Reload now** / **Later**). Automatic reload does **not** run on navigation or idle — only **Reload now** on the banner (after save your work). When you ship a **breaking** API change, set **`WEB_MIN_BUILT_AT`** on App Runner (ISO timestamp); clients below that build reload **on the next navigation** (`X-Kiorly-Web-Min-Built-At` header). Optional updates still use the banner only. Tabs may fetch `/build-id.json` once when the user returns to the tab. CloudFront behaviors **`/build-id.json`** and **`/index.html`** use **caching disabled**; hashed files under `/assets/*` stay on the default optimized cache.

**Mobile performance (AWS):** CloudFront compresses responses (`compress: true`) and caches hashed `/assets/*`. Prior bottlenecks were (1) a single **~2.2 MB** JS chunk on first load and (2) render-blocking **Google Fonts** for all theme families. The web app now **lazy-loads route modules**, splits **vendor** chunks (React, TanStack Query, i18n, Radix), and loads **theme-specific fonts** only when that theme is active. Default theme is **Clinical OS** (`clinical-os-light`). After deploy, verify `dist/assets/index-*.js` is well under 500 KB gzipped and feature routes load separate chunks in DevTools → Network.

Local build check:

```bash
cd apps/web
npm run build
# Optional split-origin preview:
VITE_API_URL="https://YOUR_APP_URL" npm run build
```

---

## 9. Post-deploy seed & demo users

**DbSeedFn** runs idempotent seed:
- Does **not** wipe existing data or reset passwords on existing accounts.
- Ensures demo orgs, users, clinics, patients when missing.
- Documented accounts: [`Test_Data_Users.md`](./Test_Data_Users.md).
- **Lambda image:** `apps/api/Dockerfile.seed` (Node 24 Lambda base). Handler: `infra/lambda/db-seed/run.mjs` → `prisma migrate deploy`, enum repair, `tsx prisma/seed.ts`.
- **Bundling:** any `prisma/*.ts` import of `../src/…` must have a matching **`COPY`** in `Dockerfile.seed` (enforced by `dockerfile-seed-src-coverage.node.test.ts`). Current copies include at least: `src/entitlements`, `src/subscriptions`, `src/feature-flags/feature-flag-keys.ts`, `src/common/seed-demo-guard.ts`, `src/staging`.

Re-invoke manually:

```bash
aws lambda invoke --function-name <DbSeedFunctionName> /tmp/seed-out.json
```

---

## 10. File uploads

| Environment | Storage |
|-------------|---------|
| Local dev | `uploads/` directory (`UPLOAD_STORAGE` unset / `local`) |
| App Runner prod | **S3** bucket from stack; IAM on App Runner instance role |

Supported in product: patient registration documents, national ID scan, encounter lab/radiology/prescription files, expense proofs, employee ID docs.

**Data explorer org backup:** Group admins (with data explorer access) can export **SQL**, **documents ZIP**, or a **full** backup (SQL + blobs in one ZIP with `manifest.json` mapping files to patients/encounters/operations/etc.). Jobs are **background** (progress UI supports **Cancel** or wait-until-ready; toast + recent-jobs list when ready). Downloads use a short-lived **token URL** streamed from disk (compression skipped; no `Content-Encoding: identity`; Node HTTP request timeouts disabled for the transfer). The web app prefers **File System Access** streaming (fetch → disk) so Chrome’s download manager does not fail mid-stream; local Vite hits the API origin directly. The same ZIP/SQL artifacts can be re-imported (async) into the org. The API reads uploads from local `uploads/` in dev or **S3** in App Runner.

---

## 11. Environment variables (checklist)

### API (runtime)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes* | *App Runner resolves from `DB_SECRET_ARN` in Docker entrypoint |
| `JWT_SECRET` | Yes | Secrets Manager |
| `UPLOAD_STORAGE` | Prod | `s3` |
| `S3_UPLOAD_BUCKET` | Prod | Upload bucket name |
| `PORT` | No | Default `3000` |
| `SWAGGER_ENABLED` | No | `false` in production |
| `PLATFORM_SUPER_ADMIN_EMAILS` | No | Break-glass org admin tooling |

### Web (build time)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Only if API is on a **different origin** than the SPA. Empty = same-origin `/api`. |

---

## 12. Observability, performance smoke & backups

- **App Runner / Lambda logs** → CloudWatch Logs.
- **RDS** enhanced monitoring optional; **7-day** automated backups in default stack.
- **Alarms:** add CloudWatch alarms for 5xx, unhealthy targets, RDS storage (not all wired in minimal stack).
- **Load SLO smoke (local or CI):** with API running, `npm run test:perf` issues **2000** concurrent `GET /api/v1/health/live` requests and fails if success rate &lt; **99.9%** (tune via `LOAD_TEST_*` env vars in `scripts/load-test-slo.mjs`).
- **Post-deploy:** `npm run sync:aws:smoke` → `scripts/cicd-post-deploy-smoke.sh` (readiness + demo login; see §7 probes).
- **Deploy failures:** see [§16 Deploy troubleshooting](#16-deploy-troubleshooting-common-failures).

---

## 13. Alternative paths (not the default CDK stack)

These remain valid if you outgrow App Runner or need different compliance posture:

| Option | Summary |
|--------|---------|
| **ECS Fargate + ALB** | More control, higher baseline cost; see RFC §14 alternatives |
| **Lightsail / single EC2** | Cheapest ops surface; Postgres on VM or small RDS |
| **Split API hostname** | Build web with `VITE_API_URL`; configure CORS on API |

---

## 14. Security reminders

- Never commit production `.env` or Secrets Manager values.
- Restrict **SSH**; prefer **SSM Session Manager** for break-glass DB access.
- Add **WAF** on CloudFront for public endpoints when going live with real PHI.
- Review **JWT expiry**, **CORS**, and **RBAC** before production cutover.
- Rotate **JWT_SECRET** with a planned session logout strategy.

---

## 15. Related documents

- [`README.md`](../README.md) — local setup, npm scripts, env tables.
- [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md) — platform architecture and module map.
- [`Clinic_Management_System_PRD.md`](./Clinic_Management_System_PRD.md) — product scope (v1.9), shipped features, **§12.3** production backlog, and **§12.3.13** enhancements to shipped modules.
- [`Test_Data_Users.md`](./Test_Data_Users.md) — demo logins and QA matrix.

**Infrastructure code:** `infra/src/kiorly-clinics-management-stack.ts`, `apps/api/Dockerfile`, `apps/api/Dockerfile.seed`, `apps/api/docker-entrypoint.mjs`, `scripts/cicd-*.sh`.

---

## 16. Deploy troubleshooting (common failures)

| Symptom / CI step | Likely cause | Fix / prevention |
|-------------------|--------------|------------------|
| CloudFormation **`AppRunnerVpcConnector` `UPDATE_FAILED`** `AlreadyExists` (`kiorly-clinic-connector` or `…-v2`) | Stack-wide **`cdk.Tags`** on App Runner resources force **replacement**; create-before-delete collides on global connector names | **Do not** `Tags.of(stack)` App Runner resources. Frankfurt connector name **`kiorly-clinic-connector`** only. Run `infra/scripts/check-apprunner-connector-cfn.mjs`; `scripts/cicd-cleanup-orphan-vpc-connectors.sh` before deploy. |
| CDK ✅, **`cicd-post-deploy-seed.sh`** `Cannot find module '../src/entitlements/plans-matrix'` | **DbSeedFn** image missing `prisma/seed` TypeScript dependencies | Add **`COPY`** lines to `apps/api/Dockerfile.seed`; keep `dockerfile-seed-src-coverage.node.test.ts` green. |
| CDK ✅, seed ✅, **`Post-deploy smoke`** login **503** `{"status":"starting"}` | Entrypoint spawned **`dist/main.js`** but Nest builds **`dist/src/main.js`**; proxy answers **live** while Nest never starts | `resolveNestMainJs()` in `docker-entrypoint.mjs`; smoke waits on **`/health/ready`**, not live alone. |
| **`POST /appointments`** / **`GET /markets/current`** → **500**; status patch still works | App Runner image missing **`platform/data-cells.json`** (SC-01 registry). Create/update resolve market transfer context and crash on `ENOENT` | `COPY platform/data-cells.json` (plus PDPC / email-domain registries) in `apps/api/Dockerfile`; keep `dockerfile-api-platform-coverage.node.test.ts` green. |
| Smoke timeout on **ready** | App Runner still rolling out image, migrate-on-boot slow, or Nest crash loop | CloudWatch log group `/aws/apprunner/.../application` — search `[boot]` and `Nest exited`. Re-run workflow after fix. |
| Stack **`ROLLBACK_COMPLETE`** | Any resource hard failure | Delete stack in CloudFormation console, fix template, redeploy (see §5). |

**Manual smoke (after deploy):**

```bash
export STACK_NAME=kiorly-clinics-management AWS_REGION=eu-central-1
bash scripts/cicd-post-deploy-smoke.sh
# or: npm run sync:aws:smoke   # uses stack AppUrl when AWS CLI + credentials available
```

**Residency tags (SC-01):** `KiorlyHostCell` / `KiorlyDataRegion` on **Vpc**, **RDS**, **S3** buckets — not on App Runner `VpcConnector` / autoscale / observability CFN resources.
