# infra/tofu — OpenTofu for Kiorly Clinic

Implements ADR-028 / KX-21 §01. OpenTofu **1.13.9** (`.opentofu-version`), `hashicorp/aws ~> 6.0`. **Nothing in this
tree has been applied.** Do not deploy until the founder approves the first deploy.

```
.opentofu-version   .tflint.hcl
bootstrap/          one-time per account: state bucket + KMS + GitHub OIDC roles
modules/contracts/README.md      inputs/outputs of the 10 contracts
modules/aws/{network,database,container-service,object-storage,cdn-edge,secrets,email,dns-certs,waf,observability,ci-oidc,safety-alerts,location}
modules/product-stack/    one product in one cell (precondition: provider region == platform/data-cells.json)
live/{staging,prod}/frankfurt/kiorly-clinic/    backend.tf main.tf variables.tf outputs.tf terraform.tfvars
live/prod/global/dns/    Route 53 zones (kiorly.com, kiorly.link, kiorex.com) + CAA + DNSSEC; apply before prod stacks that set `domain`
```

`modules/` is a verbatim copy of the Kiorly Clinic skeleton (KX-22). Fix a module in `clinics-management` first, then re-copy.

## State
S3 (`kiorex-tofu-state-<env>-euc1`, native `use_lockfile`) + OpenTofu client-side KMS encryption (`alias/kiorex-tofu-state`)
for state **and plan** files. One state per product / environment / cell. Backend config cannot use variables, so the
bucket names are literal in each `backend.tf`.

## 1. Bootstrap (platform admin, once per account, locally with SSO/MFA)
```sh
cd infra/tofu/bootstrap
tofu init && tofu plan && tofu apply   # local state first; creates state buckets, KMS key, GitHub OIDC + roles
```
Creates per environment a versioned, TLS-only, KMS-encrypted state bucket (90-day non-current expiry, access limited to the CI
roles + `admin_principal_arns`), the KMS key, the GitHub OIDC provider and roles `tofu-plan` (read-only, no data-plane reads;
PRs + main/kiorex branches), `tofu-apply-staging` (GitHub Environment `staging` only) and `tofu-apply-prod`
(Environment `production` only). Afterwards optionally migrate bootstrap state into the new bucket.

## 2. Plan (local, same as CI)
```sh
export AWS_PROFILE=aws-kiorex-profile      # eu-central-1
cd infra/tofu/live/staging/frankfurt/kiorly-clinic
tofu init
tofu fmt -check -recursive && tofu validate
tflint --recursive && trivy config .
tofu plan -var "git_sha=$GIT_SHA" -out plan.tfplan
```
Offline checks (no AWS): `tofu fmt -recursive && tofu init -backend=false && tofu validate` in every live directory.

## 3. Apply
Never from a laptop except documented break-glass; use `deploy.yml` (staging) and `release.yml` (production, approval).
Image first: an App Runner service needs its image, so the first apply is two-phase —
`tofu apply -target=<module>.module.container_service.aws_ecr_repository.this`, push the image tagged `$GIT_SHA`, then the full apply
(the workflows do this).
`prod` tfvars carry `aws_account_id = "REPLACE_WITH_PROD_ACCOUNT_ID"` on purpose: **NEEDS_HUMAN** decide the production
account (HB05); the validation fails until then. Staging targets the Kiorex account 599243104052.

## 4. Adopting existing resources (migration path T4-alt)
If real data already lives in the CDK stack: set CDK removal policies to RETAIN, then add `import` blocks, e.g.
```hcl
import {
  to = module.kiorly_clinic.module.database[0].aws_db_instance.this
  id = "<existing-rds-identifier>"
}
```
(also VPC, S3 buckets, KMS keys), run `tofu plan` until it shows **0 changes**, `cdk destroy` the stateless rest, recreate those
with OpenTofu. Prefer greenfield (T4) while there are no live tenants.

## 5. GitHub Actions (`.github/workflows`)
`infra-plan.yml` (PR: fmt, validate, tflint, trivy, plan with read-only `tofu-plan`), `deploy.yml` (staging),
`release.yml` (production), `drift.yml` (nightly). **All apply workflows are `workflow_dispatch` only** until the founder
approves the first deploy. Repository variables: `AWS_TOFU_PLAN_ROLE_ARN`, `AWS_TOFU_APPLY_STAGING_ROLE_ARN`,
`AWS_TOFU_APPLY_PROD_ROLE_ARN` (from bootstrap outputs); GitHub Environments `staging` and `production` (required reviewers).

## Known blockers
- AWS Organization SCPs: in account 599243104052, user `cursor-admin` gets explicit denies on `cloudformation:ListStacks`,
  `apprunner:ListServices`, `rds:DescribeDBInstances`, `s3:ListAllMyBuckets`. The org admin must relax them before plan/apply.
- HB07: with App Runner VPC egress and no NAT, calls to third-party APIs need a path — verify in staging; add a NAT or egress proxy.
- tflint is not installed locally; config is kept and runs in CI. App Runner log retention is set by the AWS CLI via a
  `terraform_data` provisioner (the service owns those log groups) — runners need the AWS CLI.
- CDK -> OpenTofu mapping is implemented as in KX-21 §01 (CDK is kept until T5). Prod defaults: HB01 WAF attached, HB02 db.t4g.medium +
  Performance Insights, HB03 CMKs + versioned uploads, HB04 min 2 instances, HB06 alarms + 90-day retention, HB09 no seed Lambda.
- `openai_secret_name = null`: set it once `scripts/configure-apprunner-openai.sh` has created the secret.
- Staging has the non-prod seed Lambda (`apps/api/Dockerfile.seed`). Application adapters for secrets/email (T2 app side) are separate work.
- `live/prod/global/dns` creates zones; NS delegation and the DNSSEC DS record at the registrar are manual (NEEDS_HUMAN, HB08/KX19).

## 6. Rev 2.3 additions: Kiorly Nurse + home visits (KX-08, KX-09, KX-23; backlog item 7)
Validated offline only (`tofu fmt`, `init -backend=false`, `validate`); **nothing applied or deployed**. No new stack or repo (ADR-031).

| Concern | Where | Default |
|---|---|---|
| `nurse.kiorly.com` alias of the Clinic stack | `product-stack` var `alias_domains`; live vars `nurse_alias_enabled`, `nurse_domain` | prod **on** (`nurse.kiorly.com`), staging **off** (staging uses the CloudFront default domain) |
| Amazon Location map + route calculator | `modules/aws/location`; live var `enable_location` | **off** (mock adapter) |
| Safety-alert delivery alarms | `modules/aws/safety-alerts`; live var `safety_alerts` | on in staging + prod, quiet until the API emits the log events |
| Geostamp retention purge | `scheduled_jobs["geostamp-retention-purge"]` in tfvars (existing EventBridge Scheduler -> job-runner Lambda -> API) | defined, **`enabled = false`** |

**nurse.kiorly.com.** The alias is an extra ACM SAN on the existing us-east-1 certificate (DNS-validated in the same zone), an extra
CloudFront alternate domain, and A/AAAA alias records in `zone_name` (`kiorly.com`). Preconditions enforce a primary domain and that every
alias sits inside `zone_name`. Apply order: `live/prod/global/dns` first. Adding a SAN replaces the certificate (`create_before_destroy`, so
no outage). Application side (separate work, not infra): nurse host handling, edition-aware OIDC client / redirect URIs for `nurse.kiorly.com`
in kiorex-account, CORS/cookie origin allow-list.

**Amazon Location** is the *real-provider* counterpart of the mock-default maps/routing adapter (CLAUDE.md mock providers,
`KIORLY_PROVIDER_MODE=mock|real`). With `enable_location = false` nothing exists in AWS. When true it creates one map and one route
calculator (data source `Esri` by default; verify Egypt coverage and terms, NEEDS_HUMAN), grants the App Runner role only
`geo:CalculateRoute*` and `geo:GetMap*`, and injects `LOCATION_MAP_NAME` / `LOCATION_ROUTE_CALCULATOR_NAME`. It never sets the mode switch:
flipping to `real` stays a human, staging-first decision logged in `Docs/NEEDS_HUMAN.md` ("Provider go-live"). Send coarse coordinates or district
centroids only, never exact patient addresses.

**Safety-alert observability** (KX-09: `SAFETY_ALERT_RAISED` delivered <= 60 s, on-call alarm if undelivered; KX-23 stop-ship "safety alert > 60 s").
The module reads the API's structured JSON logs through CloudWatch metric filters (provider-mode agnostic, so it also covers the mock delivery),
publishes to a dedicated SNS topic `<product>-<env>-safety-oncall` (and to the general alerts topic), and creates alarms:
`safety-alert-latency-over-sla` (max latency > 60 s in a 1-min window), `safety-alert-delivery-failed` (any failure), `safety-alert-undelivered`
(raised minus delivered over 5 min, producer only; may flap at window boundaries, verify against `SafetyAlert`), and `job-runner-errors`
(so a failing geostamp purge is noticed). Log contract the API must emit (PHI-free; ids, channel, numbers only):
`{"event":"safety_alert.raised"}`, `{"event":"safety_alert.delivered","deliveryLatencyMs":N}`, `{"event":"safety_alert.delivery_failed"}`
(producer); `safety_alert.received` with `endToEndLatencyMs` and `safety_alert.consume_failed` (consumer, kiorex-platform).
There is intentionally no switch to disable these alarms: safety controls are never flags (ADR-025).

**Safety on-call (rota notes, NEEDS_HUMAN).** Needs a named rota before field-visit pilots (gate GHV2): primary + secondary, 24/7 while any
home visit can be in progress, escalation to the Head of Home Care Product and the CMO after 10 min unacknowledged. Subscribe via
`safety_alerts.alarm_emails` / `alarm_webhook_urls` (pager or WhatsApp bridge; keep email as the fallback and confirm the SNS email
subscription, which is manual). Latency/failure alarms are page-now; `job-runner-errors` is a next-business-day ticket. Before the first pilot
run the staging field-visit safety drill: raise a drill alert, check it arrives <= 60 s, then force a failure and confirm the page reaches the
phone. The mock delivery path emits the same log events so the drill is runnable while providers are mocked; real channels (WhatsApp/SMS)
are re-drilled in the Provider go-live pass.

**Geostamp retention purge** (KX-08: coarse geostamps kept 12 months, then reduced to district only; retention per market pack, DPO to
confirm under PDPL, KX-15). Infra owns only the clock: daily 03:15 `Africa/Cairo`, POST `/api/v1/internal/jobs/geostamp-retention-purge`
with `X-Internal-Job-Key`, retried twice. The API must make it idempotent and batched (runner Lambda timeout 60 s) and own the 12-month
logic. `enabled = false` until that endpoint exists and the DPO signs off; enabling is a one-word tfvars change.

Offline check for this section: `cd live/{staging,prod}/frankfurt/kiorly-clinic && tofu init -backend=false && tofu validate`.

## 7. Demo-data seeding on staging (Q10, non-production only)
`modules/product-stack/demo_seed.tf` adds a `<name>-demo-seed` container-image Lambda (isolated subnets, DB access, least-privilege IAM, `MODE=mock`) created **only** when `enable_demo_seed = true` (default false; true only in `live/staging/**/terraform.tfvars`). A plan with `env = "prod"` and `enable_demo_seed = true` fails (`terraform_data.demo_seed_guard`), covered offline by `tofu test` in `modules/product-stack` (`tests/demo_seed_guard.tftest.hcl`, mock provider). Outputs `demo_seed_function_name` and `demo_seed_invoke` give the invocation. The Lambda image is the `<name>-seed` ECR repo built from `apps/api/Dockerfile.seed` (handler `demo-seed.handler`, source `infra/lambda/demo-seed/run.mjs`, test `node --test infra/lambda/demo-seed/run.test.mjs`). It is never invoked by OpenTofu or CI: after a human deployed staging, run `scripts/seed-staging.sh` from the workspace root (see `Docs/TEST_DATA.md` -> "Seeding staging on AWS").
