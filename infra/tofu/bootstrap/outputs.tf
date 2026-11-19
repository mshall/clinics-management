output "state_buckets" {
  description = "State bucket per environment (use in live/*/backend.tf)."
  value       = { for e, b in aws_s3_bucket.state : e => b.id }
}

output "state_kms_key_arn" {
  description = "KMS key ARN."
  value       = aws_kms_key.state.arn
}

output "state_kms_alias" {
  description = "KMS alias used by client-side state encryption."
  value       = aws_kms_alias.state.name
}

output "github_role_arns" {
  description = "Set these as GitHub repository variables AWS_TOFU_PLAN_ROLE_ARN / AWS_TOFU_APPLY_STAGING_ROLE_ARN / AWS_TOFU_APPLY_PROD_ROLE_ARN."
  value       = module.ci_oidc.role_arns
}

output "github_oidc_provider_arn" {
  description = "GitHub OIDC provider ARN."
  value       = module.ci_oidc.provider_arn
}
