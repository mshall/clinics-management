# Safety-alert delivery observability (KX-23 stop-ship "safety alert > 60 s", KX-09 SAFETY_ALERT_RAISED row:
# "Delivered <= 60 s; on-call alarm if undelivered", KX-08 home-visit safety controls).
#
# The module only reads structured JSON application logs, so it works for any provider mode (mock or real).
# LOG CONTRACT (the API emits these single-line JSON events; PHI-free: ids, channel names and numbers only,
# never addresses, names, phone numbers or message bodies):
#   producer  {"event":"safety_alert.raised","alertId":"..."}
#             {"event":"safety_alert.delivered","alertId":"...","channel":"...","deliveryLatencyMs":1234}
#             {"event":"safety_alert.delivery_failed","alertId":"...","channel":"..."}
#   consumer  {"event":"safety_alert.received","alertId":"...","endToEndLatencyMs":1234}   (occurredAt -> ops notified)
#             {"event":"safety_alert.consume_failed","alertId":"..."}                       (incl. outbox DEAD after 8)
# Until the API emits them the alarms stay in OK (treat_missing_data = notBreaching). Safety controls are never
# flags (ADR-025): there is deliberately no variable that disables a producer alarm in prod.

data "aws_caller_identity" "current" {}

locals {
  namespace = "Kiorex/SafetyAlerts/${var.name}"
  producer  = var.role == "producer"

  # logical metric => filter pattern (+ optional value extractor)
  filters = local.producer ? {
    Raised         = { pattern = "{ $.event = \"safety_alert.raised\" }", value = "1" }
    Delivered      = { pattern = "{ $.event = \"safety_alert.delivered\" }", value = "1" }
    DeliveryFailed = { pattern = "{ $.event = \"safety_alert.delivery_failed\" }", value = "1" }
    LatencyMs      = { pattern = "{ $.event = \"safety_alert.delivered\" && $.deliveryLatencyMs = * }", value = "$.deliveryLatencyMs" }
    } : {
    Received       = { pattern = "{ $.event = \"safety_alert.received\" }", value = "1" }
    DeliveryFailed = { pattern = "{ $.event = \"safety_alert.consume_failed\" }", value = "1" }
    LatencyMs      = { pattern = "{ $.event = \"safety_alert.received\" && $.endToEndLatencyMs = * }", value = "$.endToEndLatencyMs" }
  }

  alarm_actions = compact([aws_sns_topic.safety.arn, var.general_alerts_topic_arn])
}

# --- Dedicated on-call topic ---------------------------------------------------------------------------------
resource "aws_sns_topic" "safety" {
  name              = "${var.name}-safety-oncall"
  kms_master_key_id = var.sns_kms_key_id
  tags              = var.tags
}

data "aws_iam_policy_document" "safety" {
  statement {
    sid       = "AllowCloudWatchPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.safety.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "safety" {
  arn    = aws_sns_topic.safety.arn
  policy = data.aws_iam_policy_document.safety.json
}

resource "aws_sns_topic_subscription" "email" {
  count     = length(var.alarm_emails)
  topic_arn = aws_sns_topic.safety.arn
  protocol  = "email"
  endpoint  = var.alarm_emails[count.index]
}

resource "aws_sns_topic_subscription" "webhook" {
  count     = length(var.alarm_webhook_urls)
  topic_arn = aws_sns_topic.safety.arn
  protocol  = "https"
  endpoint  = var.alarm_webhook_urls[count.index]
}

# --- Metric filters ------------------------------------------------------------------------------------------
resource "aws_cloudwatch_log_metric_filter" "this" {
  for_each       = local.filters
  name           = "${var.name}-safety-${lower(each.key)}"
  log_group_name = var.application_log_group_name
  pattern        = each.value.pattern

  metric_transformation {
    name      = "SafetyAlert${each.key}"
    namespace = local.namespace
    value     = each.value.value
    unit      = each.key == "LatencyMs" ? "Milliseconds" : "Count"
  }
}

# --- Alarms --------------------------------------------------------------------------------------------------
# 1. Latency SLA: any single delivery slower than the SLA (stop-ship in staging drills; page in prod).
resource "aws_cloudwatch_metric_alarm" "latency" {
  alarm_name          = "${var.name}-safety-alert-latency-over-sla"
  alarm_description   = "Safety alert ${local.producer ? "delivery" : "end-to-end (raised -> Kiorex ops notified)"} took more than ${var.latency_threshold_ms / 1000} s (KX-09 / KX-23). Page the safety on-call; see README on-call notes."
  namespace           = local.namespace
  metric_name         = "SafetyAlertLatencyMs"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = var.latency_threshold_ms
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = var.tags
  depends_on          = [aws_cloudwatch_log_metric_filter.this]
}

# 2. Explicit delivery / consume failure (every provider path exhausted; outbox DEAD).
resource "aws_cloudwatch_metric_alarm" "failed" {
  alarm_name          = "${var.name}-safety-alert-delivery-failed"
  alarm_description   = "A safety alert ${local.producer ? "could not be delivered on any channel" : "could not be consumed (outbox DEAD / ops notify failed)"} (KX-09: on-call alarm if undelivered). Page the safety on-call."
  namespace           = local.namespace
  metric_name         = "SafetyAlertDeliveryFailed"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = var.tags
  depends_on          = [aws_cloudwatch_log_metric_filter.this]
}

# 3. Producer only: raised but never reported delivered (catches a crashed dispatcher that logs nothing).
#    A 5-minute window can flap when an alert straddles the boundary; the OK action clears it. Safety first: a
#    false page is acceptable, a missed one is not. Verify against the SafetyAlert table.
resource "aws_cloudwatch_metric_alarm" "undelivered" {
  count               = local.producer ? 1 : 0
  alarm_name          = "${var.name}-safety-alert-undelivered"
  alarm_description   = "More safety alerts were raised than delivered in 5 min (KX-09: on-call alarm if undelivered). Verify in SafetyAlert; may flap at window boundaries."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = var.tags

  metric_query {
    id          = "gap"
    expression  = "FILL(raised, 0) - FILL(delivered, 0)"
    label       = "raised - delivered"
    return_data = true
  }
  metric_query {
    id = "raised"
    metric {
      namespace   = local.namespace
      metric_name = "SafetyAlertRaised"
      period      = 300
      stat        = "Sum"
    }
  }
  metric_query {
    id = "delivered"
    metric {
      namespace   = local.namespace
      metric_name = "SafetyAlertDelivered"
      period      = 300
      stat        = "Sum"
    }
  }
  depends_on = [aws_cloudwatch_log_metric_filter.this]
}

# 4. Optional: scheduled-job runner errors (geostamp retention purge must not fail silently, KX-08 / KX-15).
resource "aws_cloudwatch_metric_alarm" "job_runner_errors" {
  count               = var.job_runner_function_name == null ? 0 : 1
  alarm_name          = "${var.name}-job-runner-errors"
  alarm_description   = "Scheduled job runner reported errors (e.g. geostamp retention purge). Not safety-critical: ticket, fix within a day."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.job_runner_function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = compact([var.general_alerts_topic_arn])
  tags                = var.tags
}
