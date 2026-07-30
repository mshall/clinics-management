# Architecture comparison — Kiorly vs PiggyMetrics

This page maps the **Kiorly Clinics Management** monorepo (NestJS + React) to the classic [**PiggyMetrics**](https://github.com/sqshq/PiggyMetrics) microservices reference (Spring Boot + Spring Cloud). Use PiggyMetrics as a **pattern catalog**; Kiorly intentionally ships as a **modular monolith** for clinic operations.

---

## At a glance

| Dimension | Kiorly Clinics | PiggyMetrics |
|-----------|----------------|--------------|
| **Purpose** | Multi-tenant clinic management (patients, encounters, HR, finance) | Personal finance demo (accounts, statistics, notifications) |
| **Deployment** | Nest API + Vite SPA (+ optional AWS App Runner / RDS) | Many Spring Boot services + MongoDB + RabbitMQ via Docker Compose |
| **Data store** | PostgreSQL (Prisma), single schema with `tenantId` | MongoDB per microservice |
| **Auth** | JWT in SPA (`/api/v1/auth/login`) | OAuth2 authorization server + resource scopes |
| **Config** | `.env` + tenant feature flags | Spring Cloud Config server |
| **Discovery / gateway** | Single API origin (CloudFront `/api/*` in AWS) | Eureka + Zuul API gateway |
| **Observability** | Application logs, audit trail in DB | Hystrix dashboard, Turbine, centralized ELK, Sleuth tracing |

---

## Service mapping (conceptual)

PiggyMetrics splits by **bounded context**. Kiorly keeps the same domains as **Nest modules** inside `apps/api/src/`:

| PiggyMetrics service | Responsibility | Kiorly equivalent |
|---------------------|----------------|-------------------|
| **Account** | Incomes, expenses, savings settings | `patients`, `encounters`, `operations`, `expenses`, `revenue` modules |
| **Statistics** | Aggregated time series | `reports`, `dashboard` services |
| **Notification** | Email reminders, user settings | Not shipped (backlog — PRD §12.3 notifications) |
| **Auth** | OAuth2 tokens | `auth` module (JWT) |
| **Config** | Centralized YAML | Env vars + `Tenant` / feature flags in `admin` |
| **Gateway** | Route `/notifications/**` etc. | Vite dev proxy + CloudFront path routing |
| **Registry (Eureka)** | Instance lookup | N/A — single API process |

---

## When to borrow from PiggyMetrics

| Pattern | PiggyMetrics | Kiorly today | Future direction (RFC backlog) |
|---------|--------------|--------------|--------------------------------|
| **Circuit breaker** | Hystrix on inter-service calls | In-process error handling | External integrations (labs, SMS) may need retries/breakers |
| **Per-service database** | MongoDB per service | Shared PostgreSQL, tenant-scoped rows | RLS / read replicas (RFC F.4) |
| **Async jobs** | Scheduled notification worker | Sync HTTP for most flows | Report export jobs (RFC §6.2) |
| **Dynamic config refresh** | `@RefreshScope` + `/refresh` | Restart / deploy for env changes | Feature flags already in DB |
| **Distributed tracing** | Spring Cloud Sleuth | Request logging + audit | OpenTelemetry (backlog) |

---

## Documentation sync

The PiggyMetrics README on **`master`** is vendored into this repo by:

```bash
npm run docs:sync
```

Metadata lives in `apps/docs/content/piggymetrics/SYNC.json` (commit SHA, sync timestamp). View it in the docs portal under **Reference → PiggyMetrics (synced)**.

---

## Related paths

| Topic | Path |
|-------|------|
| Kiorly PRD (shipped scope) | `Docs/Clinic_Management_System_PRD.md` §12.1 |
| Kiorly RFC (API modules) | `Docs/Clinic_Management_System_RFC.md` §6 |
| Docs portal (this site) | `apps/docs/` — `npm run docs:dev` |
| Upstream PiggyMetrics | https://github.com/sqshq/PiggyMetrics |
