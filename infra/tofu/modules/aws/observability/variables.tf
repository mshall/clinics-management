variable "name" {
  description = "Name prefix."
  type        = string
}

variable "sns_kms_key_id" {
  description = "KMS key id/ARN for the alert topic (the 'alerts' CMK). null = unencrypted topic."
  type        = string
  default     = null
}

variable "alarm_emails" {
  description = "Email subscribers for the alert topic."
  type        = list(string)
  default     = []
}

variable "alarm_webhook_urls" {
  description = "HTTPS endpoints (on-call webhook bridge: Slack / WhatsApp) subscribed to the alert topic."
  type        = list(string)
  default     = []
}

variable "apprunner_service_name" {
  description = "App Runner service name (alarm dimension). null = skip App Runner alarms."
  type        = string
  default     = null
}

variable "apprunner_service_id" {
  description = "App Runner service id (alarm dimension and log group names)."
  type        = string
  default     = null
}

variable "apprunner_max_size" {
  description = "Autoscaling max size (active-instances-at-max alarm threshold)."
  type        = number
  default     = 25
}

variable "manage_apprunner_log_retention" {
  description = "Set retention on the App Runner log groups with the AWS CLI (the service creates them itself; HB06)."
  type        = bool
  default     = true
}

variable "rds_identifier" {
  description = "RDS instance identifier. null = skip RDS alarms."
  type        = string
  default     = null
}

variable "rds_allocated_storage_gb" {
  description = "RDS allocated storage in GB (free-storage alarm = 20%)."
  type        = number
  default     = 20
}

variable "rds_instance_class" {
  description = "RDS instance class (derives the connection alarm threshold)."
  type        = string
  default     = "db.t4g.medium"
}

variable "lambda_function_names" {
  description = "Lambda functions whose errors page (seed Lambda: errors in a deploy window block the release)."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "Application log retention (KX-21 §07: 90 days)."
  type        = number
  default     = 90
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a CloudWatch-supported retention value."
  }
}

variable "budget_usd" {
  description = "Monthly cost budget in USD (alerts at 80% actual / 100% forecast). 0 = no budget (account-level budgets live elsewhere)."
  type        = number
  default     = 0
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
