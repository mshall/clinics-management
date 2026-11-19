# Contract: dns_certs. Route 53 zones (+CAA, optional DNSSEC), ACM certificates in us-east-1 for CloudFront.

data "aws_caller_identity" "current" {}

# --- Zones ---------------------------------------------------------------------------------------
resource "aws_route53_zone" "this" {
  for_each = var.zones
  name     = each.key
  comment  = each.value.comment == "" ? "Kiorex ecosystem zone ${each.key}" : each.value.comment
  tags     = var.tags
}

resource "aws_route53_record" "caa" {
  for_each = var.zones
  zone_id  = aws_route53_zone.this[each.key].zone_id
  name     = each.key
  type     = "CAA"
  ttl      = 3600
  records = concat(
    [for i in var.caa_issuers : "0 issue \"${i}\""],
    [for i in var.caa_issuers : "0 issuewild \"${i}\""],
  )
}

# --- DNSSEC (HB08) ---------------------------------------------------------------------------------
data "aws_iam_policy_document" "dnssec_key" {
  statement {
    sid       = "EnableAccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "AllowRoute53DNSSECSigning"
    actions   = ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign", "kms:Verify"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["dnssec-route53.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
  statement {
    sid       = "AllowRoute53DNSSECGrants"
    actions   = ["kms:CreateGrant"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["dnssec-route53.amazonaws.com"]
    }
    condition {
      test     = "Bool"
      variable = "kms:GrantIsForAWSResource"
      values   = ["true"]
    }
  }
}

resource "aws_kms_key" "dnssec" {
  count                    = var.enable_dnssec && length(var.zones) > 0 ? 1 : 0
  provider                 = aws.us_east_1
  description              = "Route 53 DNSSEC key-signing key"
  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30
  policy                   = data.aws_iam_policy_document.dnssec_key.json
  tags                     = var.tags
}

resource "aws_route53_key_signing_key" "this" {
  for_each                   = var.enable_dnssec ? var.zones : {}
  hosted_zone_id             = aws_route53_zone.this[each.key].id
  key_management_service_arn = aws_kms_key.dnssec[0].arn
  name                       = replace(each.key, ".", "-")
}

resource "aws_route53_hosted_zone_dnssec" "this" {
  for_each       = var.enable_dnssec ? var.zones : {}
  hosted_zone_id = aws_route53_key_signing_key.this[each.key].hosted_zone_id
}

# --- ACM certificates (CloudFront requires us-east-1) --------------------------------------------
resource "aws_acm_certificate" "this" {
  for_each                  = var.certificates
  provider                  = aws.us_east_1
  domain_name               = each.value.domain
  subject_alternative_names = each.value.sans
  validation_method         = "DNS"
  tags                      = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  validation_records = merge([
    for cname, cert in aws_acm_certificate.this : {
      for dvo in cert.domain_validation_options : "${cname}/${dvo.domain_name}" => {
        cert    = cname
        name    = dvo.resource_record_name
        type    = dvo.resource_record_type
        record  = dvo.resource_record_value
        zone_id = var.certificates[cname].zone_id
      }
    }
  ]...)
}

resource "aws_route53_record" "validation" {
  for_each        = local.validation_records
  zone_id         = each.value.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  for_each                = var.certificates
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.this[each.key].arn
  validation_record_fqdns = [for k, r in aws_route53_record.validation : r.fqdn if local.validation_records[k].cert == each.key]
}

# --- CloudFront alias records ---------------------------------------------------------------------
resource "aws_route53_record" "alias_a" {
  for_each = var.create_alias_records ? var.alias_records : {}
  zone_id  = each.value.zone_id
  name     = each.value.name
  type     = "A"
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "alias_aaaa" {
  for_each = var.create_alias_records ? var.alias_records : {}
  zone_id  = each.value.zone_id
  name     = each.value.name
  type     = "AAAA"
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_zone_id
    evaluate_target_health = false
  }
}
