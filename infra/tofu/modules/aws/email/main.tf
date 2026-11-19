# Contract: email. SES domain identity, DKIM/SPF/DMARC records, configuration set.
# NH-016: production access (leave the SES sandbox) is a manual AWS support request.

data "aws_region" "current" {}

locals {
  create_records = var.enabled && var.zone_id != null
  mail_from      = "bounce.${var.domain}"
}

resource "aws_sesv2_configuration_set" "this" {
  count                  = var.enabled ? 1 : 0
  configuration_set_name = replace(var.domain, ".", "-")
  reputation_options {
    reputation_metrics_enabled = true
  }
  sending_options {
    sending_enabled = true
  }
  delivery_options {
    tls_policy = "REQUIRE"
  }
  tags = var.tags
}

resource "aws_sesv2_email_identity" "this" {
  count                  = var.enabled ? 1 : 0
  email_identity         = var.domain
  configuration_set_name = aws_sesv2_configuration_set.this[0].configuration_set_name
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
  tags = var.tags
}

resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  count                  = var.enabled ? 1 : 0
  email_identity         = aws_sesv2_email_identity.this[0].email_identity
  mail_from_domain       = local.mail_from
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "dkim" {
  count   = local.create_records ? 3 : 0
  zone_id = var.zone_id
  name    = "${aws_sesv2_email_identity.this[0].dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.this[0].dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_route53_record" "mail_from_mx" {
  count   = local.create_records ? 1 : 0
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${data.aws_region.current.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  count   = local.create_records ? 1 : 0
  zone_id = var.zone_id
  name    = local.mail_from
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "dmarc" {
  count   = local.create_records ? 1 : 0
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = [var.dmarc_report_address == null ? "v=DMARC1; p=${var.dmarc_policy}" : "v=DMARC1; p=${var.dmarc_policy}; rua=mailto:${var.dmarc_report_address}"]
}

data "aws_iam_policy_document" "send" {
  count = var.enabled ? 1 : 0
  statement {
    sid       = "SendFromIdentity"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.this[0].arn, aws_sesv2_configuration_set.this[0].arn]
  }
}
