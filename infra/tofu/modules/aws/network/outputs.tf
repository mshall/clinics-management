output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "VPC CIDR block."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnets (App Runner connector ENIs), sorted."
  value       = sort(aws_subnet.public[*].id)
}

output "isolated_subnet_ids" {
  description = "Isolated subnets (RDS, endpoints, Lambda)."
  value       = aws_subnet.isolated[*].id
}

output "connector_security_group_id" {
  description = "Security group of the App Runner VPC connector."
  value       = aws_security_group.connector.id
}

output "lambda_security_group_id" {
  description = "Security group for VPC-attached Lambdas (seed)."
  value       = aws_security_group.lambda.id
}

output "vpce_hosts" {
  description = "Interface-endpoint DNS hostnames keyed by service (secretsmanager, kms, sts). Host only - no scheme, no zone id."
  value       = { for k, e in aws_vpc_endpoint.interface : k => e.dns_entry[0].dns_name }
}
