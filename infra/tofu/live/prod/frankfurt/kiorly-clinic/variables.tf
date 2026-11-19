variable "aws_account_id" {
  description = "AWS account id of this environment (guards against applying to the wrong account)."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account id (NEEDS_HUMAN for prod: decide the account, HB05)."
  }
}

variable "git_sha" {
  description = "Image tag (git sha) built and pushed by CI. Pass with -var git_sha=$GIT_SHA."
  type        = string
  default     = "unset"
}

variable "enabled" {
  description = "false = placeholder stack (product ships later); nothing is created."
  type        = bool
  default     = true
}

variable "domain" {
  description = "Custom domain (empty = CloudFront default domain)."
  type        = string
  default     = ""
}

variable "zone_name" {
  description = "Route 53 zone holding the domain (live/prod/global/dns)."
  type        = string
  default     = ""
}

variable "api" {
  description = "App Runner sizing (cpu, memory, min, max, max_concurrency, health_path)."
  type        = any
  default     = {}
}

variable "db" {
  description = "RDS settings (engine_version, instance_class, multi_az, backup_days, deletion_protection, storage_gb, max_storage_gb, name, username, performance_insights, skip_final_snapshot)."
  type        = any
  default     = {}
}

variable "uploads" {
  description = "Uploads bucket settings (versioning, kms, prefix_expiration_days)."
  type        = any
  default     = {}
}

variable "env_vars" {
  description = "Plain runtime environment variables."
  type        = map(string)
  default     = {}
}

variable "runtime_secrets" {
  description = "Extra runtime secrets: env var => Secrets Manager ARN."
  type        = map(string)
  default     = {}
}

variable "enable_database" {
  description = "Create RDS."
  type        = bool
  default     = true
}

variable "enable_uploads" {
  description = "Create the uploads bucket."
  type        = bool
  default     = true
}

variable "enable_cdn" {
  description = "Create web bucket + CloudFront."
  type        = bool
  default     = true
}

variable "enable_seed_lambda" {
  description = "Seed Lambda (non-prod only)."
  type        = bool
  default     = false
}

variable "enable_email" {
  description = "SES identity."
  type        = bool
  default     = false
}

variable "email_domain" {
  description = "SES sending domain."
  type        = string
  default     = ""
}

variable "dmarc_report_address" {
  description = "DMARC rua address."
  type        = string
  default     = null
}

variable "enable_opensearch" {
  description = "OpenSearch domain (off by default)."
  type        = bool
  default     = false
}

variable "enable_redis" {
  description = "ElastiCache Redis (off by default)."
  type        = bool
  default     = false
}

variable "opensearch" {
  description = "OpenSearch settings."
  type        = any
  default     = {}
}

variable "redis" {
  description = "Redis settings."
  type        = any
  default     = {}
}

variable "waf_enabled" {
  description = "Attach the CloudFront WAF web ACL (HB01)."
  type        = bool
  default     = true
}

variable "use_cmk" {
  description = "Customer-managed KMS keys (HB03)."
  type        = bool
  default     = true
}

variable "openai_secret_name" {
  description = "Existing Secrets Manager secret holding {apiKey} (null = none)."
  type        = string
  default     = null
}

variable "generated_secrets" {
  description = "Extra generated secrets."
  type        = any
  default     = {}
}

variable "placeholder_secrets" {
  description = "Secret containers populated by a human."
  type        = set(string)
  default     = []
}

variable "scheduled_jobs" {
  description = "EventBridge Scheduler jobs."
  type        = any
  default     = {}
}

variable "alarm_emails" {
  description = "Alarm email subscribers (NEEDS_HUMAN)."
  type        = list(string)
  default     = []
}

variable "alarm_webhook_urls" {
  description = "On-call webhook endpoints."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "Log retention (HB06)."
  type        = number
  default     = 90
}

variable "budget_usd" {
  description = "Monthly budget (0 = none)."
  type        = number
  default     = 0
}

variable "observability_enabled" {
  description = "App Runner X-Ray tracing."
  type        = bool
  default     = true
}

variable "nurse_alias_enabled" {
  description = "Serve the Kiorly Nurse edition on nurse_domain as an alias of this stack (extra ACM SAN + CloudFront alternate domain + Route 53 records). KX-08: nurse.kiorly.com is an alias of the Clinic stack, no new stack/repo."
  type        = bool
  default     = false
}

variable "nurse_domain" {
  description = "Nurse edition host name; must be inside zone_name and requires a primary domain."
  type        = string
  default     = "nurse.kiorly.com"
}

variable "enable_location" {
  description = "Amazon Location map + route calculator (real-provider counterpart of the mock maps adapter). Default false: the adapter runs in MOCK mode. Enable only in the Provider go-live pass."
  type        = bool
  default     = false
}

variable "location_route_data_source" {
  description = "Route calculator data provider: Esri | Here | Grab (verify Egypt coverage, NEEDS_HUMAN)."
  type        = string
  default     = "Esri"
}

variable "safety_alerts" {
  description = "Safety-alert delivery alarms (enabled, role, latency_threshold_ms, alarm_emails, alarm_webhook_urls, watch_job_runner). KX-09: delivered <= 60 s."
  type        = any
  default     = {}
}
