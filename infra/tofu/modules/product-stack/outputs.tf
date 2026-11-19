# Same outputs as the CDK stack (AppUrl, AppRunnerServiceUrl, DbSecretArn, DbSeedFunctionName, HostCell, DataRegion) + extras.

output "app_url" {
  description = "HTTPS URL: SPA + /api/* (custom domain if set, else CloudFront default; App Runner URL when there is no CDN)."
  value       = var.enable_cdn ? "https://${local.has_domain ? var.domain : module.cdn[0].domain_name}" : "https://${module.container_service.service_url}"
}

output "api_origin" {
  description = "Direct App Runner URL (https://<service_url>). Prefer app_url for users."
  value       = "https://${module.container_service.service_url}"
}

output "db_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master credential."
  value       = var.enable_database ? module.database[0].master_secret_arn : null
}

output "db_endpoint" {
  description = "Database host:port reference."
  value       = var.enable_database ? "${module.database[0].address}:${module.database[0].port}" : null
}

output "db_seed_function_name" {
  description = "Seed Lambda name (non-prod only)."
  value       = one(aws_lambda_function.seed[*].function_name)
}

output "host_cell" {
  description = "Data residency cell."
  value       = var.cell
}

output "data_region" {
  description = "Region of every data store of this stack."
  value       = local.region
}

output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = module.container_service.ecr_repository_url
}

output "seed_ecr_repository_url" {
  description = "ECR repository URL for the seed Lambda image (non-prod)."
  value       = try(module.container_service.extra_ecr_repository_urls["${local.name}-seed"], null)
}

output "web_bucket" {
  description = "Web bucket name for `aws s3 sync` (null without CDN)."
  value       = var.enable_cdn ? module.web[0].bucket_id : null
}

output "uploads_bucket" {
  description = "Uploads bucket name."
  value       = var.enable_uploads ? module.uploads[0].bucket_id : null
}

output "distribution_id" {
  description = "CloudFront distribution id (cache invalidation)."
  value       = var.enable_cdn ? module.cdn[0].distribution_id : null
}

output "alerts_topic_arn" {
  description = "SNS alert topic."
  value       = module.observability.alerts_topic_arn
}

output "app_runner_service_name" {
  description = "App Runner service name (deployment waits)."
  value       = module.container_service.service_name
}

output "app_runner_service_arn" {
  description = "App Runner service ARN."
  value       = module.container_service.service_arn
}

output "kms_key_arns" {
  description = "Customer-managed KMS key ARNs by purpose."
  value       = module.secrets.kms_key_arns
}

output "opensearch_endpoint" {
  description = "OpenSearch VPC endpoint (null when disabled)."
  value       = one(aws_opensearch_domain.this[*].endpoint)
}

output "redis_endpoint" {
  description = "Redis primary endpoint (null when disabled)."
  value       = one(aws_elasticache_replication_group.redis[*].primary_endpoint_address)
}
