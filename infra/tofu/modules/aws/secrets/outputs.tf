output "kms_key_arns" {
  description = "Customer-managed key ARNs keyed by purpose."
  value       = { for k, v in aws_kms_key.this : k => v.arn }
}

output "secret_arns" {
  description = "Generated secret ARNs keyed by name."
  value       = { for k, v in aws_secretsmanager_secret.generated : k => v.arn }
}

output "secret_field_arns" {
  description = "App Runner runtime-secret references (<arn>:<jsonKey>::) keyed by name."
  value = merge(
    { for k, v in aws_secretsmanager_secret.generated : k => "${v.arn}:${var.generated_secrets[k].key}::" },
    { for k, v in aws_secretsmanager_secret.hex : k => "${v.arn}:${var.generated_hex_secrets[k].key}::" },
  )
}

output "placeholder_secret_arns" {
  description = "Placeholder secret ARNs keyed by name."
  value       = { for k, v in aws_secretsmanager_secret.placeholder : k => v.arn }
}

output "named_placeholder_secret_arns" {
  description = "Explicit-name placeholder secret ARNs keyed by full name."
  value       = { for k, v in aws_secretsmanager_secret.named_placeholder : k => v.arn }
}

output "openai_secret_arn" {
  description = "Imported OpenAI secret ARN (null when not configured)."
  value       = one(data.aws_secretsmanager_secret.openai[*].arn)
}

output "readable_secret_arns" {
  description = "All secret ARNs an app role may read (generated + placeholders + OpenAI)."
  value = concat(
    [for v in aws_secretsmanager_secret.generated : v.arn],
    [for v in aws_secretsmanager_secret.hex : v.arn],
    [for v in aws_secretsmanager_secret.placeholder : v.arn],
    [for v in aws_secretsmanager_secret.named_placeholder : v.arn],
    data.aws_secretsmanager_secret.openai[*].arn,
  )
}
