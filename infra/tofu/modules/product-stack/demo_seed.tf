# Q10 Part B: NON-PRODUCTION demo-data seed job (container-image Lambda, same pattern as the DbSeedFn in seed.tf).
# Runs `prisma migrate deploy` -> compiled base seed -> compiled demo seed (`node dist-seed/...`, no ts-node) inside the isolated subnets with DB access.
# Created ONLY when enable_demo_seed = true (default false; true only in staging tfvars). A plan with env = "prod" and enable_demo_seed = true FAILS.
# The Lambda is never invoked by OpenTofu or CI: a human runs scripts/seed-staging.sh (or the `demo_seed_invoke` output) AFTER the first staging deploy.
# Image: the existing <name>-seed ECR repo (built from apps/api/Dockerfile.seed, handler `demo-seed.handler`); the repo is created when either seed Lambda is enabled.

variable "enable_demo_seed" {
  description = "Create the demo-data seed Lambda (migrate + base seed + demo seed). NON-PRODUCTION ONLY: the plan fails when env = prod."
  type        = bool
  default     = false
}

variable "demo_seed_env" {
  description = "Extra environment variables for the demo seed Lambda (non-secret), e.g. the sibling products' base URLs for the Kiorex relay steps."
  type        = map(string)
  default     = {}
}

variable "demo_seed_timeout_seconds" {
  description = "Lambda timeout (max 900)."
  type        = number
  default     = 900
}

locals {
  demo_seed_enabled = var.enable_demo_seed && var.env != "prod" && var.enable_database
  # The seed sees the same (non-secret) runtime environment as the API, so keys such as the address-encryption key resolve identically.
  demo_seed_env = merge(
    { for k, v in local.runtime_env : k => v if !contains(["PORT", "PRISMA_MIGRATE_ON_BOOT", "PRISMA_SEED_ON_BOOT"], k) },
    {
      KIORLY_ENV                        = var.env
      ENV_TAG                           = var.env
      DEMO_SEED_ALLOWED                 = "true"
      ALLOW_DEMO_SEED                   = "true"
      PRISMA_SEED_ENSURE_DEMO_PASSWORDS = "true"
      MODE                              = "mock" # staging providers stay mock: seeded flows work without real providers
      DEMO_SEED_RUNTIME_SECRETS         = jsonencode(local.runtime_secrets)
    },
    var.demo_seed_env,
  )
}

resource "terraform_data" "demo_seed_guard" {
  input = var.enable_demo_seed
  lifecycle {
    precondition {
      condition     = !(var.env == "prod" && var.enable_demo_seed)
      error_message = "The demo-data seed must never be enabled in production (enable_demo_seed = true is only allowed with env != prod)."
    }
    precondition {
      condition     = !var.enable_demo_seed || var.enable_database
      error_message = "enable_demo_seed needs enable_database = true (the seed runs against the product database)."
    }
  }
}

resource "aws_cloudwatch_log_group" "demo_seed" {
  count             = local.demo_seed_enabled ? 1 : 0
  name              = "/aws/lambda/${local.name}-demo-seed"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_iam_role" "demo_seed" {
  count              = local.demo_seed_enabled ? 1 : 0
  name               = "${local.name}-demo-seed"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "demo_seed_vpc" {
  count      = local.demo_seed_enabled ? 1 : 0
  role       = aws_iam_role.demo_seed[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Least privilege: read the DB credentials and the app secrets the runtime already reads (never write), decrypt with the secrets key. No S3, no SES, no IAM.
data "aws_iam_policy_document" "demo_seed" {
  count = local.demo_seed_enabled ? 1 : 0
  statement {
    sid       = "ReadSeedSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = concat([module.database[0].master_secret_arn], module.secrets.readable_secret_arns)
  }
  dynamic "statement" {
    for_each = contains(keys(local.kms), "secrets") ? [1] : []
    content {
      sid       = "DecryptSecretKey"
      actions   = ["kms:Decrypt"]
      resources = [local.kms["secrets"]]
    }
  }
}

resource "aws_iam_role_policy" "demo_seed" {
  count  = local.demo_seed_enabled ? 1 : 0
  name   = "demo-seed-read-secrets"
  role   = aws_iam_role.demo_seed[0].id
  policy = data.aws_iam_policy_document.demo_seed[0].json
}

resource "aws_lambda_function" "demo_seed" {
  count         = local.demo_seed_enabled ? 1 : 0
  function_name = "${local.name}-demo-seed"
  description   = "NON-PRODUCTION demo data seed (migrate + base seed + demo seed). Invoke by hand after a staging deploy."
  role          = aws_iam_role.demo_seed[0].arn
  package_type  = "Image"
  image_uri     = "${module.container_service.extra_ecr_repository_urls["${local.name}-seed"]}:${coalesce(var.seed_image_tag, var.image_tag)}"
  architectures = ["x86_64"]
  timeout       = var.demo_seed_timeout_seconds
  memory_size   = 3008

  image_config {
    command = ["demo-seed.handler"]
  }

  vpc_config {
    subnet_ids         = module.network[0].isolated_subnet_ids
    security_group_ids = [module.network[0].lambda_security_group_id]
  }

  environment {
    variables = local.demo_seed_env
  }

  tags       = merge(local.tags, { Purpose = "demo-seed", Env = var.env })
  depends_on = [terraform_data.demo_seed_guard, aws_cloudwatch_log_group.demo_seed, aws_iam_role_policy_attachment.demo_seed_vpc, aws_iam_role_policy.demo_seed]
}

output "demo_seed_function_name" {
  description = "Demo seed Lambda name (null unless enable_demo_seed; staging only)."
  value       = one(aws_lambda_function.demo_seed[*].function_name)
}

output "demo_seed_invoke" {
  description = "How to run the demo seed once the staging stack is deployed (a human does this; OpenTofu never invokes it)."
  value = local.demo_seed_enabled ? join("", [
    "aws lambda invoke --function-name ${local.name}-demo-seed --cli-read-timeout 900 --payload '{\"reset\":false}' --cli-binary-format raw-in-base64-out /tmp/${local.name}-demo-seed.json",
    " && cat /tmp/${local.name}-demo-seed.json   # {\"reset\":true} removes and re-creates the demo records only; or run scripts/seed-staging.sh (all products, in order)",
  ]) : null
}
