output "topic_arn" {
  description = "Dedicated safety on-call SNS topic ARN."
  value       = aws_sns_topic.safety.arn
}

output "namespace" {
  description = "CloudWatch metric namespace of the safety-alert metrics."
  value       = local.namespace
}

output "alarm_names" {
  description = "Safety alarm names (runbook / drill checklist)."
  value = compact([
    aws_cloudwatch_metric_alarm.latency.alarm_name,
    aws_cloudwatch_metric_alarm.failed.alarm_name,
    one(aws_cloudwatch_metric_alarm.undelivered[*].alarm_name),
  ])
}
