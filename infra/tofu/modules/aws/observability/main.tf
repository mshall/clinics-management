# Contract: observability. CloudWatch alarms (KX-21 §13), SNS -> on-call, dashboard, log retention, budget.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  apprunner = var.apprunner_service_name != null && var.apprunner_service_id != null
  rds       = var.rds_identifier != null

  # PostgreSQL max_connections ~ DBInstanceClassMemory / 9531392 (RDS default); alarm at 80%.
  class_memory_gib = {
    "db.t4g.micro"  = 1
    "db.t4g.small"  = 2
    "db.t4g.medium" = 4
    "db.t4g.large"  = 8
    "db.m7g.large"  = 8
    "db.m7g.xlarge" = 16
  }
  max_connections       = floor(lookup(local.class_memory_gib, var.rds_instance_class, 4) * 1073741824 / 9531392)
  connections_threshold = floor(local.max_connections * 0.8)

  apprunner_dims = {
    ServiceName = var.apprunner_service_name
    ServiceID   = var.apprunner_service_id
  }
}

# --- SNS -----------------------------------------------------------------------------------------
resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = var.sns_kms_key_id
  tags              = var.tags
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "AllowAccountPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
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

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  count     = length(var.alarm_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_emails[count.index]
}

resource "aws_sns_topic_subscription" "webhook" {
  count     = length(var.alarm_webhook_urls)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = var.alarm_webhook_urls[count.index]
}

# --- App Runner alarms ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "apprunner_5xx" {
  count               = local.apprunner ? 1 : 0
  alarm_name          = "${var.name}-apprunner-5xx-rate"
  alarm_description   = "App Runner 5xx rate > 2% for 5 min (KX-21 §13) - on-call"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 2
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "rate"
    expression  = "IF(requests>0,(errors/requests)*100,0)"
    label       = "5xx %"
    return_data = true
  }
  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "5xxStatusResponses"
      period      = 300
      stat        = "Sum"
      dimensions  = local.apprunner_dims
    }
  }
  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/AppRunner"
      metric_name = "Requests"
      period      = 300
      stat        = "Sum"
      dimensions  = local.apprunner_dims
    }
  }
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "apprunner_p95" {
  count               = local.apprunner ? 1 : 0
  alarm_name          = "${var.name}-apprunner-p95-latency"
  alarm_description   = "App Runner p95 latency > 1.5 s for 10 min (KX-21 §13) - on-call"
  namespace           = "AWS/AppRunner"
  metric_name         = "RequestLatency"
  dimensions          = local.apprunner_dims
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1500
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "apprunner_at_max" {
  count               = local.apprunner ? 1 : 0
  alarm_name          = "${var.name}-apprunner-instances-at-max"
  alarm_description   = "Active instances = max size for 15 min (KX-21 §13) - raise limit / investigate"
  namespace           = "AWS/AppRunner"
  metric_name         = "ActiveInstances"
  dimensions          = local.apprunner_dims
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.apprunner_max_size
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# --- RDS alarms ----------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  count               = local.rds ? 1 : 0
  alarm_name          = "${var.name}-rds-cpu"
  alarm_description   = "RDS CPU > 80% for 15 min (KX-21 §13) - on-call"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  count               = local.rds ? 1 : 0
  alarm_name          = "${var.name}-rds-free-storage"
  alarm_description   = "RDS free storage < 20% of allocated (KX-21 §13) - on-call"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.rds_allocated_storage_gb * 0.2 * 1073741824
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  count               = local.rds ? 1 : 0
  alarm_name          = "${var.name}-rds-connections"
  alarm_description   = "RDS connections > 80% of max (KX-21 §13) - plan RDS Proxy (HB11)"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = var.rds_identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = local.connections_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# Failover / failure / low-storage events -> notify.
resource "aws_db_event_subscription" "rds" {
  count            = local.rds ? 1 : 0
  name             = "${var.name}-rds-events"
  sns_topic        = aws_sns_topic.alerts.arn
  source_type      = "db-instance"
  source_ids       = [var.rds_identifier]
  event_categories = ["failover", "failure", "low storage", "recovery", "availability"]
  tags             = var.tags
}

# --- Lambda errors (seed Lambda; block the release) --------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = toset(var.lambda_function_names)
  alarm_name          = "${var.name}-lambda-${each.key}-errors"
  alarm_description   = "Lambda ${each.key} reported errors - block the release"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# --- App Runner log retention (HB06) ----------------------------------------------------------------
# App Runner creates /aws/apprunner/<name>/<id>/{application,service} itself, so retention is set with
# the AWS CLI after the service exists (needs the AWS CLI + logs:PutRetentionPolicy; present in CI).
resource "terraform_data" "apprunner_log_retention" {
  count = local.apprunner && var.manage_apprunner_log_retention ? 1 : 0

  triggers_replace = [var.apprunner_service_id, var.log_retention_days]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      for kind in application service; do
        group="/aws/apprunner/${var.apprunner_service_name}/${var.apprunner_service_id}/$kind"
        for i in $(seq 1 30); do
          if aws logs describe-log-groups --region ${data.aws_region.current.region} --log-group-name-prefix "$group" --query 'logGroups[0].logGroupName' --output text | grep -q "$group"; then
            aws logs put-retention-policy --region ${data.aws_region.current.region} --log-group-name "$group" --retention-in-days ${var.log_retention_days}
            break
          fi
          sleep 10
        done
      done
    EOT
  }
}

# --- Dashboard: golden signals ---------------------------------------------------------------------
locals {
  apprunner_widgets = [
    {
      type = "metric", x = 0, y = 0, width = 12, height = 6
      properties = {
        title  = "Traffic and errors"
        region = data.aws_region.current.region
        stat   = "Sum"
        period = 300
        metrics = [
          ["AWS/AppRunner", "Requests", "ServiceName", coalesce(var.apprunner_service_name, "-"), "ServiceID", coalesce(var.apprunner_service_id, "-")],
          [".", "5xxStatusResponses", ".", ".", ".", "."],
          [".", "4xxStatusResponses", ".", ".", ".", "."],
        ]
      }
    },
    {
      type = "metric", x = 12, y = 0, width = 12, height = 6
      properties = {
        title  = "Latency p95 (ms) and saturation"
        region = data.aws_region.current.region
        period = 300
        metrics = [
          ["AWS/AppRunner", "RequestLatency", "ServiceName", coalesce(var.apprunner_service_name, "-"), "ServiceID", coalesce(var.apprunner_service_id, "-"), { stat = "p95" }],
          [".", "ActiveInstances", ".", ".", ".", ".", { stat = "Maximum", yAxis = "right" }],
          [".", "CPUUtilization", ".", ".", ".", ".", { stat = "Average", yAxis = "right" }],
          [".", "MemoryUtilization", ".", ".", ".", ".", { stat = "Average", yAxis = "right" }],
        ]
      }
    },
  ]
  rds_widgets = [
    {
      type = "metric", x = 0, y = 6, width = 24, height = 6
      properties = {
        title  = "Database"
        region = data.aws_region.current.region
        period = 300
        metrics = [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", coalesce(var.rds_identifier, "-"), { stat = "Average" }],
          [".", "DatabaseConnections", ".", ".", { stat = "Maximum", yAxis = "right" }],
          [".", "FreeStorageSpace", ".", ".", { stat = "Minimum", yAxis = "right" }],
        ]
      }
    },
  ]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = "${var.name}-golden-signals"
  dashboard_body = jsonencode({
    widgets = concat(
      [for w in local.apprunner_widgets : w if local.apprunner],
      [for w in local.rds_widgets : w if local.rds],
    )
  })
}

# --- Budget (80% actual / 100% forecast) ------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  count        = var.budget_usd > 0 && length(var.alarm_emails) > 0 ? 1 : 0
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Product$%s", lookup(var.tags, "Product", ""))]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alarm_emails
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alarm_emails
    subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
  }
}
