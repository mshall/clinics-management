# AWS cloud deployment guide

This document describes how to deploy the **Clinics Management** monorepo (NestJS API in `apps/api`, React SPA in `apps/web`, PostgreSQL via Prisma) to **Amazon Web Services**. It complements the high-level cost tiers in the root [`README.md`](../README.md) and the architecture notes in [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md).

**Scope:** A practical, **minimum viable production** layout you can grow later (RDS, containerized API, static web on S3 + CloudFront). This is not a full security or compliance audit; engage your own review for PHI/PII and regional regulations.

---

## 1. What you are deploying

| Component | Artifact | AWS home (recommended) |
|-----------|----------|-------------------------|
| PostgreSQL schema + data | Prisma migrations (`apps/api/prisma/migrations`) | **Amazon RDS for PostgreSQL** |
| REST API (`/api/v1`, optional `/docs`) | `apps/api` → `dist/` | **ECS Fargate** behind an **Application Load Balancer**, or a single **EC2 / Lightsail** VM |
| Web SPA | `apps/web/dist` | **S3** + **CloudFront** (or static files on the same VM as the API) |
| File uploads (encounters, expenses, HR) | Local `uploads/` tree today | **Amazon EFS** mounted into ECS tasks, or **S3** with a future code change |

---

## 2. Prerequisites

- AWS account with IAM users/roles following least privilege.
- A **region** chosen and used consistently (e.g. `me-south-1` or `eu-central-1`).
- **Docker** (optional but recommended) to build the API image locally before push to **ECR**.
- **Node.js 20+** for local `npm run build` and `npx prisma migrate deploy`.
- **Domain + TLS**: **ACM** certificate in `us-east-1` if you use CloudFront (ACM for ALB can be in the workload region).

---

## 3. Reference architecture (recommended)

```
Users
  │
  ├─► CloudFront (HTTPS) ──► S3 bucket (web SPA: index.html + assets)
  │
  └─► ALB (HTTPS) ──► ECS Fargate service (Nest API containers)
                           │
                           ├──► RDS PostgreSQL (private subnets)
                           └──► (optional) EFS for uploads/  OR  S3 (future)
```

- **CloudFront** serves the SPA and can forward `/api/*` to the ALB **or** you point the SPA to a separate API hostname via `VITE_API_URL` at build time (typical).
- **ALB** terminates TLS for the API, runs health checks on `/api/v1` or a dedicated health route.
- **RDS** lives in **private subnets**; security group allows **only** the ECS service security group on port **5432**.
- **Secrets** (`JWT_SECRET`, `DATABASE_URL`, etc.) in **AWS Secrets Manager** (or SSM Parameter Store **SecureString**); injected as environment variables in the task definition.

---

## 4. Database (RDS)

1. Create a **PostgreSQL** RDS instance (start with `db.t4g.micro` or similar for non-production).
2. Create database + user matching your connection string (or use the master user only for dev).
3. **Security groups:** allow inbound 5432 from the API security group only.
4. From your laptop or a bastion with network access to RDS:

   ```bash
   cd apps/api
   export DATABASE_URL="postgresql://USER:PASS@RDS_ENDPOINT:5432/DBNAME?schema=public"
   npx prisma migrate deploy
   ```

5. **Seeding:** run `npx prisma db seed` **only** in non-production if you want demo data; **never** run destructive demo seed against a real tenant without review.

---

## 5. API container (ECS Fargate + ECR)

### 5.1 Build and push an image

1. Create an **ECR** repository, e.g. `clinics-management-api`.
2. Build the API image (you can adapt the existing Dockerfile under `infra/docker` if present, or add a multi-stage Dockerfile that runs `npm run build -w api` and starts `node dist/main.js`).
3. Authenticate Docker to ECR, **tag**, and **push** the image.

### 5.2 Task definition

- **Image:** ECR URI + tag (often the git SHA).
- **CPU / memory:** start small (e.g. 0.25 vCPU / 512 MB) and increase if p95 latency or memory pressure warrants.
- **Environment variables** (non-secret): `PORT=3000`, `NODE_ENV=production`, `SWAGGER_ENABLED=false`.
- **Secrets:** map Secrets Manager ARNs to env vars (`DATABASE_URL`, `JWT_SECRET`).
- **Logging:** `awslogs` driver to a CloudWatch log group.

### 5.3 Service + ALB

- Target group: **HTTP** (or HTTPS if terminating on ALB) pointing to container port **3000** (or your `PORT`).
- Health check path: e.g. `GET /api/v1` if it returns 200, or add a lightweight `/health` in the API and use that.
- **Auto scaling** (optional): scale on CPU / request count after you have metrics.

---

## 6. Web SPA (S3 + CloudFront)

1. **Build** with the public API URL baked in:

   ```bash
   cd apps/web
   VITE_API_URL="https://api.yourdomain.com" npm run build
   ```

2. Upload **`dist/`** contents to an **S3** bucket (no public ACL; origin access via **Origin Access Control**).
3. Create a **CloudFront** distribution:
   - Default root object: `index.html`
   - **SPA routing:** add a custom error response for **403/404** → `/index.html` with **200** so client-side routes work.
4. **CORS:** If the browser calls `https://api...` from `https://app...`, enable CORS on the Nest app for those origins (allowed origin list), or serve API and web under one domain via CloudFront path-based routing.

---

## 7. Environment variables (checklist)

### API (runtime)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | RDS connection string; use TLS query params if you enable RDS encryption in transit. |
| `JWT_SECRET` | Yes | Long random string; rotate with a planned logout of all sessions. |
| `PORT` | No | Default `3000` inside the container; ALB target must match. |
| `SWAGGER_ENABLED` | No | Set `false` in production unless you protect `/docs` behind auth/VPN. |

### Web (build time)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Public base URL of the API (e.g. `https://api.example.com`). Empty means same-origin `/api` (requires reverse proxy or CloudFront routing). |

---

## 8. Migrations and releases

1. **CI pipeline** (e.g. GitHub Actions): run tests → build Docker image → push to ECR → **register new task definition revision** → **update ECS service** (rolling deploy).
2. **Migrations:** run `prisma migrate deploy` as a **one-off ECS task** or **CodeDeploy hook** *before* or *in lockstep with* the new task revision—pick a strategy your team agrees on (common: migrate first, then deploy API).
3. **Rollback:** keep the previous task definition revision; roll back the service if the new tasks fail health checks.

---

## 9. uploads / durable files

The API currently writes under **`uploads/`** on the local filesystem. On ECS:

- **EFS:** mount a volume at the same path the app expects (configure `uploads` root in config if needed), **or**
- **S3:** longer-term improvement—upload handler streams to S3 and stores keys in Postgres.

For **Lightsail / single EC2**, attach a **persistent block volume** and mount it where `uploads/` lives.

---

## 10. Observability and backups

- **CloudWatch:** container logs, ALB access logs, RDS enhanced monitoring (optional).
- **Alarms:** 5xx rate, target health, RDS free storage, CPU.
- **RDS:** enable **automated backups** with retention ≥ 7 days for anything beyond a toy environment.
- **S3 versioning** (optional) on the web bucket for quick rollbacks of bad deploys.

---

## 11. Simpler path: one Lightsail or EC2 instance

If you want the **lowest operational surface**:

- One VM with **Docker Compose** (Postgres + API) or Postgres on RDS + API on the VM.
- **Nginx** or **Caddy** reverse proxy: TLS, static `dist/`, proxy `/api` to Nest.
- **Certbot** or Caddy for Let’s Encrypt.

See **Option A** in the main README for trade-offs and rough cost order-of-magnitude.

---

## 12. Security reminders

- Never commit production `.env` files.
- Restrict **SSH** to known IPs; prefer **SSM Session Manager** instead of open port 22.
- **WAF** on CloudFront / ALB if you expose public endpoints.
- Review **CORS**, **rate limiting**, and **JWT expiry** before going live.

---

## 13. Related documents

- [`README.md`](../README.md) — local setup, env tables, cost tiers.
- [`Clinic_Management_System_RFC.md`](./Clinic_Management_System_RFC.md) — broader platform architecture.
- [`Clinic_Management_System_PRD.md`](./Clinic_Management_System_PRD.md) — product scope and roles.

When this repository gains **CDK or Terraform** modules, link them here and shorten this guide to “run `cd infra && …`”.
