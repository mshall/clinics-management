output "identity_arn" {
  description = "SES identity ARN (null when disabled)."
  value       = one(aws_sesv2_email_identity.this[*].arn)
}

output "domain" {
  description = "Sending domain."
  value       = var.enabled ? var.domain : null
}

output "configuration_set" {
  description = "SES configuration set name."
  value       = one(aws_sesv2_configuration_set.this[*].configuration_set_name)
}

output "send_policy_json" {
  description = "IAM policy JSON granting send access; merge into the app instance role."
  value       = one(data.aws_iam_policy_document.send[*].json)
}
