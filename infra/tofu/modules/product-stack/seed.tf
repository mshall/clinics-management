# Optional, NON-PRODUCTION idempotent migrate + seed Lambda (CDK DbSeedFn). Image is built by CI from
# apps/api/Dockerfile.seed and pushed to <name>-seed; ECR repo is created first (see deploy.yml two-phase apply).

resource "aws_cloudwatch_log_group" "seed" {
  count             = local.seed_enabled ? 1 : 0
  name              = "/aws/lambda/${local.name}-db-seed"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "seed" {
  count              = local.seed_enabled ? 1 : 0
  name               = "${local.name}-db-seed"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "seed_vpc" {
  count      = local.seed_enabled ? 1 : 0
  role       = aws_iam_role.seed[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "seed" {
  count = local.seed_enabled ? 1 : 0
  statement {
    sid       = "ReadDbSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [module.database[0].master_secret_arn]
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

resource "aws_iam_role_policy" "seed" {
  count  = local.seed_enabled ? 1 : 0
  name   = "read-db-secret"
  role   = aws_iam_role.seed[0].id
  policy = data.aws_iam_policy_document.seed[0].json
}

resource "aws_lambda_function" "seed" {
  count         = local.seed_enabled ? 1 : 0
  function_name = "${local.name}-db-seed"
  role          = aws_iam_role.seed[0].arn
  package_type  = "Image"
  image_uri     = "${module.container_service.extra_ecr_repository_urls["${local.name}-seed"]}:${coalesce(var.seed_image_tag, var.image_tag)}"
  architectures = ["x86_64"]
  timeout       = 900
  memory_size   = 3008

  vpc_config {
    subnet_ids         = module.network[0].isolated_subnet_ids
    security_group_ids = [module.network[0].lambda_security_group_id]
  }

  environment {
    variables = {
      DB_SECRET_ARN                     = module.database[0].master_secret_arn
      SECRETS_MANAGER_VPCE_HOST         = module.network[0].vpce_hosts["secretsmanager"]
      KMS_VPCE_HOST                     = module.network[0].vpce_hosts["kms"]
      PRISMA_SEED_ENSURE_DEMO_PASSWORDS = "true"
    }
  }

  tags       = local.tags
  depends_on = [aws_cloudwatch_log_group.seed, aws_iam_role_policy_attachment.seed_vpc, aws_iam_role_policy.seed]
}
