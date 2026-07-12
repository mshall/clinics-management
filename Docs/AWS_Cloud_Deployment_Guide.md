# AWS cloud deployment guide

This document describes how the **Clinics Management** monorepo is deployed to **Amazon Web Services** today, and how to run or adapt that setup. It complements the root [`README.md`](../README.md) cost tiers and [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md) architecture notes.

**Repository:** [github.com/mshall/clinics-management](https://github.com/mshall/clinics-management)

**Scope:** The **checked-in CDK stack** (`infra/`) — not a generic ECS tutorial. For PHI/PII and regional regulations, perform your own compliance review.

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

CI/CD (push main) ──► build web + api image ──► cdk deploy ──► invoke DbSeedFn
```

**Design choices in this stack:**
- **Region:** `eu-central-1` (Frankfurt); DB timezone `Europe/Berlin`; API `TZ=Europe/Berlin`.
- **No NAT gateway** — App Runner VPC connector + **interface VPC endpoints** (Secrets Manager, KMS, STS) to avoid NAT cost.
- **No ALB** — App Runner is the compute target; CloudFront talks to App Runner’s HTTPS URL via a custom resource that parses the origin host.
- **Migrations on boot** — `PRISMA_MIGRATE_ON_BOOT=true` on App Runner; interim health listener in Docker entrypoint during migrate.
- **Seed off boot** — `PRISMA_SEED_ON_BOOT=false` so App Runner stabilizes within deploy timeouts; **`scripts/cicd-post-deploy-seed.sh`** invokes **DbSeedFn** after CDK succeeds.

Source: `infra/src/kiorly-clinics-management-stack.ts`.

---

## 3. Prerequisites

- AWS account; **OIDC** trust for GitHub Actions (see `.github/workflows/deploy-aws.yml` header comments).
- **Node.js 20+**, **npm**, **Docker** (CDK builds API/seed images).
- One-time: `npx cdk bootstrap aws://ACCOUNT_ID/eu-central-1` from `infra/`.
- GitHub secret **`AWS_DEPLOY_ROLE_ARN`** with permission to deploy the stack and invoke DbSeedFn.

---

## 4. Deploy via GitHub Actions (recommended)

Workflow: **`.github/workflows/deploy-aws.yml`**

| Trigger | Action |
|---------|--------|
| Push to **`main`** | Build API + web → `cdk deploy` → post-deploy seed |
| **workflow_dispatch** | Same, manual |

Steps (summary):
1. `npm ci`, `npm run build -w web`, Prisma generate.
2. `npm run infra:deploy` (or equivalent CDK deploy script in repo).
3. `scripts/cicd-post-deploy-seed.sh` — invokes **DbSeedFn** with `PRISMA_SEED_ENSURE_DEMO_PASSWORDS=true`.

PR validation: **`.github/workflows/pr-synth-build.yml`** runs CDK synth without AWS credentials.

---

## 5. Deploy locally (CDK)

From repository root:

```bash
npm ci
npm run build -w web
npm run build -w api   # if your pipeline builds before CDK
cd infra
npm ci
npx cdk deploy
```

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
- **Port:** 3000; health check **`GET /api/v1/health/live`**.
- **CPU / memory:** 1 vCPU, 2 GB (stack default — supports migrate-on-boot).
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

**Data explorer documents ZIP:** Group admins (with data explorer access) can download a ZIP of all blobs linked to selected DB entities. The API reads from the same storage backend as uploads — local `uploads/` in dev, **S3** in App Runner — and includes `manifest.json` listing each file’s DB source and zip path. Empty selections produce a ZIP with `README.txt` only.

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

## 12. Observability & backups

- **App Runner / Lambda logs** → CloudWatch Logs.
- **RDS** enhanced monitoring optional; **7-day** automated backups in default stack.
- **Alarms:** add CloudWatch alarms for 5xx, unhealthy targets, RDS storage (not all wired in minimal stack).

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
- [`Clinic_Management_System_PRD.md`](./Clinic_Management_System_PRD.md) — product scope, shipped features, and **§12.3 production feature backlog**.
- [`Test_Data_Users.md`](./Test_Data_Users.md) — demo logins and QA matrix.

**Infrastructure code:** `infra/src/kiorly-clinics-management-stack.ts`, `apps/api/Dockerfile`, `apps/api/Dockerfile.seed`.
