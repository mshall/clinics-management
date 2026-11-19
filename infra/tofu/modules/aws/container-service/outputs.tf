output "service_arn" {
  description = "App Runner service ARN."
  value       = aws_apprunner_service.this.arn
}

output "service_id" {
  description = "App Runner service id (CloudWatch ServiceID dimension)."
  value       = aws_apprunner_service.this.service_id
}

output "service_name" {
  description = "App Runner service name (CloudWatch ServiceName dimension)."
  value       = aws_apprunner_service.this.service_name
}

output "service_url" {
  description = "App Runner default hostname (no scheme). Used directly as the CloudFront /api/* origin - no parser Lambda."
  value       = aws_apprunner_service.this.service_url
}

output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = aws_ecr_repository.this.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.this.name
}

output "extra_ecr_repository_urls" {
  description = "Additional ECR repository URLs keyed by repository name."
  value       = { for k, r in aws_ecr_repository.extra : k => r.repository_url }
}

output "instance_role_arn" {
  description = "App Runner instance role ARN."
  value       = aws_iam_role.instance.arn
}

output "vpc_connector_arn" {
  description = "VPC connector ARN (null when disabled)."
  value       = one(aws_apprunner_vpc_connector.this[*].arn)
}
