output "identifier" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.identifier
}

output "arn" {
  description = "RDS instance ARN."
  value       = aws_db_instance.this.arn
}

output "address" {
  description = "Database host name (pass to the app as DB_HOST)."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Database port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "username" {
  description = "Master username."
  value       = aws_db_instance.this.username
}

output "master_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master credential (DB_SECRET_ARN)."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "security_group_id" {
  description = "Database security group."
  value       = aws_security_group.this.id
}

output "allocated_storage_gb" {
  description = "Initial allocated storage (GB), for the free-storage alarm."
  value       = aws_db_instance.this.allocated_storage
}

output "instance_class" {
  description = "RDS instance class."
  value       = aws_db_instance.this.instance_class
}
