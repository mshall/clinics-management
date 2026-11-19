# CDK -> OpenTofu migration tracker (ADR-028, KX-21 §01)

Code: `infra/tofu/` (see `infra/tofu/README.md`). The CDK stack (`infra/src`) stays until T5. **Nothing has been applied to AWS.**

| Step | Action | Status | Owner |
|---|---|---|---|
| T1 | Bootstrap state bucket, KMS key, GitHub OIDC roles in target accounts | Written (`infra/tofu/bootstrap`), not applied | Founder / platform admin |
| T2 | `modules/aws/*` + `product-stack`; app adapters for secrets and email | **Done locally**: modules + live stacks pass `tofu fmt`/`init -backend=false`/`validate`. App-side secrets/email adapters still pending | Platform (done) / API team (adapters) |
| T3 | Deploy staging greenfield, smoke, golden flows, load test | Pending founder approval (apply workflows are `workflow_dispatch` only) | Founder |
| T4 | Production greenfield in new prod account (no live tenants) | Pending: prod account id (`REPLACE_WITH_PROD_ACCOUNT_ID`), domains, on-call lists | Founder |
| T4-alt | Import path if real tenant data exists | Documented in README §4 | — |
| T5 | Point domains at OpenTofu CloudFront; destroy CDK stack; delete `infra/src` + CDK steps in deploy-aws.yml | Pending (after cutover) | Platform |

## Pipeline changes
- `.github/workflows/deploy-aws-kiorex.yml`: no longer triggers on push to `kiorex` (manual only).
- New: `infra-plan.yml`, `deploy.yml`, `release.yml`, `drift.yml` (apply workflows manual; enable push/tag triggers after founder approves first deploy). `deploy-aws.yml` (main) untouched.

## Blockers / NEEDS_HUMAN
- **AWS Organization SCPs** (account 599243104052, user `cursor-admin`): explicit denies on `cloudformation:ListStacks`, `apprunner:ListServices`, `rds:DescribeDBInstances`, `s3:ListAllMyBuckets`. The org admin must relax them before any plan/apply.
- Production account id (HB05), domains/registrar delegation + DNSSEC DS (HB08), on-call emails/webhooks, budget, OpenAI secret name, SES production access (NH-016).
- HB07 outbound path from App Runner VPC egress (NAT or egress proxy) to be verified in staging.
- `tflint` not run locally (not installed); `trivy` runs in CI.
