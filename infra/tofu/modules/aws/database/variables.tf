variable "identifier" {
  description = "RDS instance identifier."
  type        = string
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "subnet_ids" {
  description = "Isolated subnet ids for the DB subnet group."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach PostgreSQL on 5432 (App Runner connector, seed Lambda)."
  type        = list(string)
}

variable "engine_version" {
  description = "PostgreSQL major (or major.minor) version."
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "RDS instance class. Prod: db.t4g.medium (HB02)."
  type        = string
  default     = "db.t4g.medium"
}

variable "multi_az" {
  description = "Multi-AZ standby."
  type        = bool
  default     = true
}

variable "storage_gb" {
  description = "Initial gp3 storage (GB)."
  type        = number
  default     = 20
}

variable "max_storage_gb" {
  description = "Storage autoscaling ceiling (GB)."
  type        = number
  default     = 100
}

variable "backup_days" {
  description = "Automated backup retention (AWS max 35)."
  type        = number
  default     = 35
}

variable "deletion_protection" {
  description = "Deletion protection."
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy (non-prod only)."
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Initial database name."
  type        = string
}

variable "username" {
  description = "Master username. The password is generated and kept in Secrets Manager (manage_master_user_password) - never in state."
  type        = string
}

variable "timezone" {
  description = "Runtime timezone for the DB parameter group (data cell runtimeTimezone)."
  type        = string
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key for storage + Performance Insights (null = AWS-managed key)."
  type        = string
  default     = null
}

variable "secret_kms_key_arn" {
  description = "Customer-managed KMS key for the managed master secret (null = aws/secretsmanager)."
  type        = string
  default     = null
}

variable "performance_insights" {
  description = "Enable Performance Insights (HB02). Not supported on db.t4g.micro/small."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch retention for PostgreSQL logs (HB06)."
  type        = number
  default     = 90
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
