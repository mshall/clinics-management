# Contract helper: ci-oidc. GitHub Actions OIDC provider + least-privilege deploy roles (no access keys in GitHub).

locals {
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.tags
}

data "aws_iam_policy_document" "trust" {
  for_each = var.roles
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = each.value.subjects
    }
  }
}

resource "aws_iam_role" "this" {
  for_each             = var.roles
  name                 = each.key
  description          = each.value.description
  assume_role_policy   = data.aws_iam_policy_document.trust[each.key].json
  max_session_duration = each.value.max_session_duration
  tags                 = var.tags
}

locals {
  managed_attachments = merge([
    for rname, r in var.roles : {
      for arn in r.managed_policy_arns : "${rname}|${arn}" => { role = rname, arn = arn }
    }
  ]...)
}

resource "aws_iam_role_policy_attachment" "managed" {
  for_each   = local.managed_attachments
  role       = aws_iam_role.this[each.value.role].name
  policy_arn = each.value.arn
}

resource "aws_iam_role_policy" "inline" {
  for_each = { for k, r in var.roles : k => r if r.inline_policy_json != null }
  name     = "inline"
  role     = aws_iam_role.this[each.key].id
  policy   = each.value.inline_policy_json
}
