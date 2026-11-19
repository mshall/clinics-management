# Contract: secrets. Secrets Manager + KMS. JWT generated with random_password; OpenAI secret via data source.
# CDK: secretsmanager.Secret(JwtSecret) + Secret.fromSecretNameV2(openai).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# --- Customer-managed KMS keys -------------------------------------------------------------------
data "aws_iam_policy_document" "key" {
  for_each = var.kms_purposes

  statement {
    sid       = "EnableAccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # SNS alarm topic encryption: CloudWatch alarms, EventBridge, RDS events and Budgets must publish.
  dynamic "statement" {
    for_each = each.key == "alerts" ? [1] : []
    content {
      sid       = "AllowAlertPublishers"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
      resources = ["*"]
      principals {
        type        = "Service"
        identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com", "events.rds.amazonaws.com", "budgets.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "aws:SourceAccount"
        values   = [data.aws_caller_identity.current.account_id]
      }
    }
  }
}

resource "aws_kms_key" "this" {
  for_each                = var.kms_purposes
  description             = "${var.name} ${each.key} (customer-managed)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.key[each.key].json
  tags                    = merge(var.tags, { KiorlyKeyPurpose = each.key })
}

resource "aws_kms_alias" "this" {
  for_each      = var.kms_purposes
  name          = "alias/${var.name}-${each.key}"
  target_key_id = aws_kms_key.this[each.key].key_id
}

# --- Generated secrets ------------------------------------------------------------------------------
resource "random_password" "generated" {
  for_each = var.generated_secrets
  length   = each.value.length
  special  = false # alphanumeric: safe in env vars, URLs and JSON
}

resource "aws_secretsmanager_secret" "generated" {
  for_each                = var.generated_secrets
  name                    = "${var.name}/${each.key}"
  description             = "${var.name} ${each.key} (generated; JSON field '${each.value.key}')"
  kms_key_id              = contains(var.kms_purposes, "secrets") ? aws_kms_key.this["secrets"].arn : null
  recovery_window_in_days = var.recovery_window_days
  tags                    = var.tags
}

resource "aws_secretsmanager_secret_version" "generated" {
  for_each      = var.generated_secrets
  secret_id     = aws_secretsmanager_secret.generated[each.key].id
  secret_string = jsonencode({ (each.value.key) = random_password.generated[each.key].result })
}

resource "aws_secretsmanager_secret" "placeholder" {
  for_each                = var.placeholder_secrets
  name                    = "${var.name}/${each.key}"
  description             = "${var.name} ${each.key} - populated by a human (NEEDS_HUMAN)"
  kms_key_id              = contains(var.kms_purposes, "secrets") ? aws_kms_key.this["secrets"].arn : null
  recovery_window_in_days = var.recovery_window_days
  tags                    = var.tags
}

data "aws_secretsmanager_secret" "openai" {
  count = var.openai_secret_name == null ? 0 : 1
  name  = var.openai_secret_name
}
