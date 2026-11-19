# Contract: waf. WAFv2 WebACL, CLOUDFRONT scope (us-east-1), implementing platform/waf-rules.json (HB01).

locals {
  action = { for r in var.waf_rules.rules : r.id => upper(r.action) }
  has    = { for id in ["rate-public-auth", "aws-managed-common", "aws-managed-known-bad-inputs", "geo-optional"] : id => contains(keys(local.action), id) }
}

resource "aws_wafv2_web_acl" "this" {
  provider    = aws.us_east_1
  name        = "${var.name}-cloudfront"
  description = "Kiorex edge protection - generated from platform/waf-rules.json"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # rate-public-auth: 100 requests / 5 min per IP on /api/v1/auth/* and /api/v1/signup/*
  dynamic "rule" {
    for_each = local.has["rate-public-auth"] ? [1] : []
    content {
      name     = "rate-public-auth"
      priority = 10
      action {
        dynamic "block" {
          for_each = local.action["rate-public-auth"] == "BLOCK" ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = local.action["rate-public-auth"] == "COUNT" ? [1] : []
          content {}
        }
      }
      statement {
        rate_based_statement {
          limit                 = var.rate_limit
          aggregate_key_type    = "IP"
          evaluation_window_sec = 300
          scope_down_statement {
            or_statement {
              dynamic "statement" {
                for_each = var.rate_limited_path_prefixes
                content {
                  byte_match_statement {
                    search_string         = statement.value
                    positional_constraint = "STARTS_WITH"
                    field_to_match {
                      uri_path {}
                    }
                    text_transformation {
                      priority = 0
                      type     = "NONE"
                    }
                  }
                }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-rate-public-auth"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.has["aws-managed-common"] ? [1] : []
    content {
      name     = "aws-managed-common"
      priority = 20
      override_action {
        dynamic "none" {
          for_each = local.action["aws-managed-common"] == "BLOCK" ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = local.action["aws-managed-common"] == "COUNT" ? [1] : []
          content {}
        }
      }
      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesCommonRuleSet"
          vendor_name = "AWS"
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-aws-common"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.has["aws-managed-known-bad-inputs"] ? [1] : []
    content {
      name     = "aws-managed-known-bad-inputs"
      priority = 30
      override_action {
        dynamic "none" {
          for_each = local.action["aws-managed-known-bad-inputs"] == "BLOCK" ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = local.action["aws-managed-known-bad-inputs"] == "COUNT" ? [1] : []
          content {}
        }
      }
      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesKnownBadInputsRuleSet"
          vendor_name = "AWS"
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-known-bad-inputs"
        sampled_requests_enabled   = true
      }
    }
  }

  # geo-optional: COUNT only (not a residency control)
  dynamic "rule" {
    for_each = local.has["geo-optional"] && length(var.geo_count_countries) > 0 ? [1] : []
    content {
      name     = "geo-optional"
      priority = 40
      action {
        count {}
      }
      statement {
        geo_match_statement {
          country_codes = var.geo_count_countries
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-geo-optional"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-cloudfront"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}
