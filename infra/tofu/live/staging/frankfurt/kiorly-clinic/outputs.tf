output "app_url" {
  description = "HTTPS URL of the product (SPA + /api/*)."
  value       = module.kiorly_clinic.app_url
}

output "api_origin" {
  description = "Direct App Runner URL."
  value       = module.kiorly_clinic.api_origin
}

output "db_secret_arn" {
  description = "RDS-managed master secret ARN."
  value       = module.kiorly_clinic.db_secret_arn
}

output "db_endpoint" {
  description = "Database host:port."
  value       = module.kiorly_clinic.db_endpoint
}

output "db_seed_function_name" {
  description = "Seed Lambda name (non-prod)."
  value       = module.kiorly_clinic.db_seed_function_name
}

output "host_cell" {
  description = "Data residency cell."
  value       = module.kiorly_clinic.host_cell
}

output "data_region" {
  description = "Data region."
  value       = module.kiorly_clinic.data_region
}

output "ecr_repository_url" {
  description = "API image repository."
  value       = module.kiorly_clinic.ecr_repository_url
}

output "seed_ecr_repository_url" {
  description = "Seed image repository (non-prod)."
  value       = module.kiorly_clinic.seed_ecr_repository_url
}

output "web_bucket" {
  description = "Web bucket for aws s3 sync."
  value       = module.kiorly_clinic.web_bucket
}

output "uploads_bucket" {
  description = "Uploads bucket."
  value       = module.kiorly_clinic.uploads_bucket
}

output "distribution_id" {
  description = "CloudFront distribution id."
  value       = module.kiorly_clinic.distribution_id
}

output "alerts_topic_arn" {
  description = "SNS alert topic."
  value       = module.kiorly_clinic.alerts_topic_arn
}

output "app_runner_service_name" {
  description = "App Runner service name."
  value       = module.kiorly_clinic.app_runner_service_name
}

output "app_runner_service_arn" {
  description = "App Runner service ARN."
  value       = module.kiorly_clinic.app_runner_service_arn
}

output "alias_urls" {
  description = "Alias URLs (nurse.kiorly.com when enabled)."
  value       = module.kiorly_clinic.alias_urls
}

output "safety_alerts_topic_arn" {
  description = "Safety on-call SNS topic (null when disabled)."
  value       = module.kiorly_clinic.safety_alerts_topic_arn
}

output "location_map_name" {
  description = "Amazon Location map (null while the maps adapter is mock)."
  value       = module.location.map_name
}

output "location_route_calculator_name" {
  description = "Amazon Location route calculator (null while the routing adapter is mock)."
  value       = module.location.route_calculator_name
}

output "demo_seed_function_name" {
  description = "Demo seed Lambda (staging only; null unless enable_demo_seed)."
  value       = module.kiorly_clinic.demo_seed_function_name
}

output "demo_seed_invoke" {
  description = "How to run the demo seed after the staging deploy (a human runs it; see scripts/seed-staging.sh)."
  value       = module.kiorly_clinic.demo_seed_invoke
}
