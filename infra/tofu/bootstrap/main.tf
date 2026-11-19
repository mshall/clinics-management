# bootstrap/ — one-time per AWS account (KX-21 §01, migration step T1).
#   1. encrypted S3 state bucket per environment (versioning, TLS-only, public access blocked, 90-day non-current expiry)
#   2. KMS key (bucket SSE + OpenTofu client-side state encryption)
#   3. GitHub OIDC provider + roles: tofu-plan (read-only), tofu-apply-staging, tofu-apply-prod
# Run by a platform admin with AWS SSO/MFA, locally. Never from CI.

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = merge({
      Product         = "platform"
      Env             = "shared"
      Owner           = "platform-team"
      CostCenter      = "kiorex-platform"
      KiorlyStackRole = "tofu-bootstrap"
      KiorlyDataClass = "iac-state"
      ManagedBy       = "opentofu"
    }, var.tags)
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  buckets    = { for e in var.environments : e => "kiorex-tofu-state-${e}-${var.region_short}" }
  org_prefix = "arn:aws:iam::${local.account_id}"
}

# --- KMS key ---------------------------------------------------------------------------------------
resource "aws_kms_key" "state" {
  description             = "Kiorex OpenTofu state: bucket SSE + client-side state/plan encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "state" {
  name          = var.state_kms_alias
  target_key_id = aws_kms_key.state.key_id
}

# --- State buckets ---------------------------------------------------------------------------------
resource "aws_s3_bucket" "state" {
  for_each = local.buckets
  bucket   = each.value
}

resource "aws_s3_bucket_public_access_block" "state" {
  for_each                = local.buckets
  bucket                  = aws_s3_bucket.state[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  for_each = local.buckets
  bucket   = aws_s3_bucket.state[each.key].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  for_each = local.buckets
  bucket   = aws_s3_bucket.state[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  for_each = local.buckets
  bucket   = aws_s3_bucket.state[each.key].id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  for_each = local.buckets
  bucket   = aws_s3_bucket.state[each.key].id
  rule {
    id     = "expire-noncurrent-90d"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
  depends_on = [aws_s3_bucket_versioning.state]
}

locals {
  ci_role_arns = [
    "${local.org_prefix}:role/tofu-plan",
    "${local.org_prefix}:role/tofu-apply-staging",
    "${local.org_prefix}:role/tofu-apply-prod",
  ]
  allowed_principals = concat(local.ci_role_arns, var.admin_principal_arns)
}

data "aws_iam_policy_document" "state_bucket" {
  for_each = local.buckets

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state[each.key].arn, "${aws_s3_bucket.state[each.key].arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # Access limited to the CI roles and the platform admin permission set (KX-21 §01).
  dynamic "statement" {
    for_each = length(var.admin_principal_arns) > 0 ? [1] : []
    content {
      sid       = "DenyAllExceptCiAndAdmins"
      effect    = "Deny"
      actions   = ["s3:*"]
      resources = [aws_s3_bucket.state[each.key].arn, "${aws_s3_bucket.state[each.key].arn}/*"]
      principals {
        type        = "*"
        identifiers = ["*"]
      }
      condition {
        test     = "ArnNotLike"
        variable = "aws:PrincipalArn"
        values   = local.allowed_principals
      }
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  for_each   = local.buckets
  bucket     = aws_s3_bucket.state[each.key].id
  policy     = data.aws_iam_policy_document.state_bucket[each.key].json
  depends_on = [aws_s3_bucket_public_access_block.state]
}

# --- GitHub OIDC roles --------------------------------------------------------------------------------
locals {
  # tofu-plan: PR plans + drift (default/long-lived branches). Never environment-scoped, never write.
  plan_subjects = flatten([
    for repo, cfg in var.github_repos : concat(
      ["repo:${repo}:pull_request"],
      [for b in cfg.branches : "repo:${repo}:ref:refs/heads/${b}"],
    )
  ])
  # apply roles: only the matching GitHub Environment (protection rules + deployment branches live in GitHub).
  staging_subjects = [for repo, _ in var.github_repos : "repo:${repo}:environment:staging"]
  prod_subjects    = [for repo, _ in var.github_repos : "repo:${repo}:environment:production"]

  state_bucket_arns = flatten([for b in values(aws_s3_bucket.state) : [b.arn, "${b.arn}/*"]])
  state_object_arns = [for b in values(aws_s3_bucket.state) : "${b.arn}/*"]
  lock_object_arns  = [for b in values(aws_s3_bucket.state) : "${b.arn}/*.tflock"]
}

# Plan role: read-only on infrastructure metadata. Deliberately NOT the AWS ReadOnlyAccess policy,
# which would let CI read patient documents in S3 and secret values. Needs: state read, lock-file write,
# state KMS key use (client-side encryption).
data "aws_iam_policy_document" "plan" {
  statement {
    sid       = "ReadStateBuckets"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketVersioning"]
    resources = [for b in values(aws_s3_bucket.state) : b.arn]
  }
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = local.state_object_arns
  }
  statement {
    sid       = "StateLockFileOnly"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = local.lock_object_arns
  }
  statement {
    sid       = "StateKey"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [aws_kms_key.state.arn]
  }
  statement {
    sid = "ReadInfrastructureMetadata"
    actions = [
      "apprunner:Describe*", "apprunner:List*",
      "rds:Describe*", "rds:ListTagsForResource",
      "ec2:Describe*",
      "cloudfront:Get*", "cloudfront:List*",
      "wafv2:Get*", "wafv2:List*", "wafv2:Describe*",
      "acm:Describe*", "acm:List*", "acm:Get*",
      "route53:Get*", "route53:List*",
      "ecr:Describe*", "ecr:List*", "ecr:GetLifecyclePolicy", "ecr:GetRepositoryPolicy",
      "logs:Describe*", "logs:List*",
      "cloudwatch:Describe*", "cloudwatch:List*", "cloudwatch:Get*",
      "sns:Get*", "sns:List*",
      "kms:Describe*", "kms:Get*", "kms:List*",
      "secretsmanager:Describe*", "secretsmanager:List*", "secretsmanager:GetResourcePolicy",
      "iam:Get*", "iam:List*",
      "lambda:Get*", "lambda:List*",
      "ses:Get*", "ses:List*",
      "scheduler:Get*", "scheduler:List*",
      "cognito-idp:Describe*", "cognito-idp:Get*", "cognito-idp:List*",
      "es:Describe*", "es:List*", "es:Get*",
      "elasticache:Describe*", "elasticache:List*",
      "budgets:View*", "budgets:Describe*",
      "s3:GetBucket*", "s3:GetEncryptionConfiguration", "s3:GetLifecycleConfiguration",
      "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration", "s3:GetBucketPolicy",
      "s3:ListAllMyBuckets",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
}

# Apply roles: broad (they create IAM roles, KMS keys, ...) but fenced by explicit denies. Tighten with a
# permissions boundary / Access Analyzer-generated policy after the first successful deploy (HB05).
data "aws_iam_policy_document" "apply_guardrails" {
  statement {
    sid    = "DenyOrgAndSecurityTooling"
    effect = "Deny"
    actions = [
      "organizations:*",
      "account:*",
      "cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail",
      "guardduty:DeleteDetector", "guardduty:DisassociateFromMasterAccount", "guardduty:UpdateDetector",
      "securityhub:DisableSecurityHub",
      "config:StopConfigurationRecorder", "config:DeleteConfigurationRecorder",
      "iam:CreateUser", "iam:CreateAccessKey", "iam:CreateLoginProfile",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "DenyOpenTofuStateTampering"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "kms:ScheduleKeyDeletion", "kms:DisableKey", "kms:PutKeyPolicy"]
    resources = concat([for b in values(aws_s3_bucket.state) : b.arn], [aws_kms_key.state.arn])
  }
}

module "ci_oidc" {
  source = "../modules/aws/ci-oidc"

  roles = merge(
    {
      "tofu-plan" = {
        description        = "Read-only OpenTofu plan role (PRs and nightly drift) - no data-plane reads"
        subjects           = local.plan_subjects
        inline_policy_json = data.aws_iam_policy_document.plan.json
      }
    },
    contains(var.environments, "staging") ? {
      "tofu-apply-staging" = {
        description          = "OpenTofu apply role for staging (GitHub Environment staging only)"
        subjects             = local.staging_subjects
        managed_policy_arns  = ["arn:aws:iam::aws:policy/AdministratorAccess"]
        inline_policy_json   = data.aws_iam_policy_document.apply_guardrails.json
        max_session_duration = 7200
      }
    } : {},
    contains(var.environments, "prod") ? {
      "tofu-apply-prod" = {
        description          = "OpenTofu apply role for production (GitHub Environment production only, approval gated)"
        subjects             = local.prod_subjects
        managed_policy_arns  = ["arn:aws:iam::aws:policy/AdministratorAccess"]
        inline_policy_json   = data.aws_iam_policy_document.apply_guardrails.json
        max_session_duration = 7200
      }
    } : {},
  )
}
