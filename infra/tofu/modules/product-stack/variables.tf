# --- Identity of the stack ---------------------------------------------------------------------------
variable "product" {
  description = "Product id: kiorly-clinic | kiorex-platform | kiorex-account | kiorly-pharmacy | kiorly-lab."
  type        = string
}

variable "env" {
  description = "Environment: staging | prod."
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.env)
    error_message = "env must be staging or prod."
  }
}

variable "cell" {
  description = "Data cell id from platform/data-cells.json (frankfurt | cairo). The provider region MUST equal the cell awsRegion (precondition)."
  type        = string
}

variable "cells" {
  description = "Decoded `cells` object of platform/data-cells.json (passed by the live stack)."
  type        = any
}

variable "stack_role" {
  description = "KiorlyStackRole tag value."
  type        = string
  default     = "product-cell"
}

variable "image_tag" {
  description = "Image tag (git sha) of the API image in the stack's ECR repository."
  type        = string
}

variable "seed_image_tag" {
  description = "Image tag of the seed Lambda image (defaults to image_tag)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Extra tags (Product, Env, Owner, CostCenter and KiorlyHostCell/DataRegion/StackRole are added automatically)."
  type        = map(string)
  default     = {}
}

# --- Feature toggles (KX-21 §08 ecosystem stacks) -------------------------------------------------------
variable "enable_database" {
  description = "RDS PostgreSQL 16 (+ network)."
  type        = bool
  default     = true
}

variable "enable_uploads" {
  description = "Private uploads bucket (versioned, SSE-KMS)."
  type        = bool
  default     = true
}

variable "enable_cdn" {
  description = "Web bucket + CloudFront (SPA + /api/* proxy)."
  type        = bool
  default     = true
}

variable "enable_seed_lambda" {
  description = "Idempotent migrate+seed Lambda. NON-PRODUCTION ONLY (HB09)."
  type        = bool
  default     = false
}

variable "enable_email" {
  description = "SES identity (email contract)."
  type        = bool
  default     = false
}

variable "enable_opensearch" {
  description = "OpenSearch domain (Kiorex search, from M9). Disabled by default."
  type        = bool
  default     = false
}

variable "enable_redis" {
  description = "ElastiCache Redis (Kiorex slot cache). Disabled by default."
  type        = bool
  default     = false
}

# --- Edge / DNS -------------------------------------------------------------------------------------------
variable "domain" {
  description = "Custom domain for the CloudFront distribution (e.g. app.kiorly.com). Empty = CloudFront default domain."
  type        = string
  default     = ""
}

variable "alias_domains" {
  description = "Extra alternate domain names served by the same CloudFront distribution (e.g. [\"nurse.kiorly.com\"] for the Kiorly Nurse edition, KX-08). Added as ACM SANs + CloudFront aliases + Route 53 A/AAAA records. Must be inside zone_name. Empty = none."
  type        = list(string)
  default     = []
}

variable "zone_name" {
  description = "Route 53 hosted zone that holds `domain` (created by live/prod/global/dns). Required when domain or email is set."
  type        = string
  default     = ""
}

variable "email_domain" {
  description = "SES sending domain (e.g. mail.kiorly.com)."
  type        = string
  default     = ""
}

variable "dmarc_report_address" {
  description = "DMARC rua address (NEEDS_HUMAN)."
  type        = string
  default     = null
}

variable "waf_enabled" {
  description = "Attach the CloudFront-scope WAF web ACL (HB01)."
  type        = bool
  default     = true
}

variable "waf_rules" {
  description = "Decoded platform/waf-rules.json."
  type        = any
  default     = null
}

variable "waf_geo_count_countries" {
  description = "Optional COUNT-only geo rule country codes."
  type        = list(string)
  default     = []
}

# --- Compute -------------------------------------------------------------------------------------------------
variable "api" {
  description = "App Runner sizing."
  type = object({
    cpu             = optional(string, "1024")
    memory          = optional(string, "2048")
    min             = optional(number, 1)
    max             = optional(number, 25)
    max_concurrency = optional(number, 100)
    health_path     = optional(string, "/api/v1/health/live")
    port            = optional(number, 3000)
  })
  default = {}
}

variable "env_vars" {
  description = "Plain runtime env vars merged over the derived defaults (NODE_ENV, UPLOAD_STORAGE, ...)."
  type        = map(string)
  default     = {}
}

variable "runtime_secrets" {
  description = "Extra runtime secrets: env var name => Secrets Manager ARN(:key::)."
  type        = map(string)
  default     = {}
}

variable "extra_policy_json" {
  description = "Additional IAM policy JSON documents for the App Runner instance role (e.g. Cognito admin API, Lambda invoke)."
  type        = list(string)
  default     = []
}

variable "observability_enabled" {
  description = "Enable App Runner X-Ray tracing."
  type        = bool
  default     = true
}

# --- Data -------------------------------------------------------------------------------------------------------
variable "db" {
  description = "RDS settings."
  type = object({
    engine_version       = optional(string, "16")
    instance_class       = optional(string, "db.t4g.medium")
    multi_az             = optional(bool, true)
    backup_days          = optional(number, 35)
    deletion_protection  = optional(bool, true)
    storage_gb           = optional(number, 20)
    max_storage_gb       = optional(number, 100)
    name                 = optional(string, "app")
    username             = optional(string, "app")
    performance_insights = optional(bool, true)
    skip_final_snapshot  = optional(bool, false)
  })
  default = {}
}

variable "uploads" {
  description = "Uploads bucket settings (Phase 1 storage lifecycle + hygiene)."
  type = object({
    versioning = optional(bool, true)
    kms        = optional(bool, true)
    # PROPOSAL defaults — clinical current versions are never expired via lifecycle.
    noncurrent_expiration_days     = optional(number, 90)
    newer_noncurrent_versions      = optional(number, 3)
    intelligent_tiering_after_days = optional(number, 30)
    intelligent_tiering_min_bytes  = optional(number, 131072)
    intelligent_tiering_prefixes   = optional(list(string), ["patients/", "encounters/", "operations/", "imports/"])
    # imports staging + Phase 5 pending uploads (current-version expiry only).
    prefix_expiration_days = optional(map(number), {
      "imports/" = 30
      "pending/" = 1
    })
    allowed_origins              = optional(list(string), [])
    enable_inventory             = optional(bool, false)
    enable_storage_growth_alarm  = optional(bool, true)
    storage_growth_alarm_percent = optional(number, 30)
  })
  default = {}
}

variable "use_cmk" {
  description = "Create customer-managed KMS keys for RDS, uploads, secrets and alerts (HB03)."
  type        = bool
  default     = true
}

variable "openai_secret_name" {
  description = "Existing Secrets Manager secret {apiKey} to inject as OPENAI_API_KEY (null = none)."
  type        = string
  default     = null
}

variable "generated_secrets" {
  description = "Additional generated secrets (name => {key,length}); `jwt` is always created."
  type = map(object({
    key    = string
    length = optional(number, 48)
  }))
  default = {}
}

variable "enable_home_visit_address_key" {
  description = "Kiorly Clinic / Nurse: generate the 32-byte HOME_VISIT_ADDRESS_ENCRYPTION_KEY (AES-256-GCM, home addresses at rest, HVPRV01) and inject it as a runtime secret. The API REQUIRES it when NODE_ENV=production. Never rotate by replacing the secret once visits exist (data would become unreadable)."
  type        = bool
  default     = false
}

variable "egress_mode" {
  description = "HB07 outbound path for the API (VPC connector): none (default, USD 0, fine while providers are mock), nat_single (~USD 32/mo), nat_per_az (~USD 65/mo). See clinics-management Docs/HB07_EGRESS.md."
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "nat_single", "nat_per_az"], var.egress_mode)
    error_message = "egress_mode must be none, nat_single or nat_per_az."
  }
}

variable "extra_interface_endpoints" {
  description = "Extra AWS-API interface endpoints in the VPC (e.g. [\"email\", \"logs\"]); AWS services only, about USD 7.3/month per AZ each."
  type        = set(string)
  default     = []
}

variable "telehealth_turn_secret" {
  description = "ADR-039: create the EMPTY Secrets Manager container /<product>/<env>/cloudflare-turn (value {\"turnKeyId\",\"apiToken\"} written by scripts/setup-telehealth-turn.sh; readable only by the App Runner instance role) and point the API at it. false = no TURN (calls fall back to STUN-only)."
  type        = bool
  default     = false
}

variable "lead_signing_secret" {
  description = "ADR-040 front door: create the EMPTY Secrets Manager container for the partner-lead signing secret (kiorex-platform: /kiorex-platform/<env>/partner-lead-signing = PARTNER_LEAD_SIGNING_SECRET; products: /<product>/<env>/kiorex-lead-signing = KIOREX_LEAD_SIGNING_SECRET). The value is written ONLY by kiorex-platform scripts/setup-partner-lead-secret.sh, never by OpenTofu."
  type        = bool
  default     = false
}

variable "lead_signing_secret_inject" {
  description = "Wire the container into the App Runner runtime env. Set true ONLY after scripts/setup-partner-lead-secret.sh <env> has written a value (App Runner cannot start an instance whose secret has no value). Requires lead_signing_secret."
  type        = bool
  default     = false
}

variable "placeholder_secrets" {
  description = "Secret containers populated by a human (PSP keys, HMAC client secrets, WhatsApp tokens)."
  type        = set(string)
  default     = []
}

# --- Scheduled jobs / search / cache -------------------------------------------------------------------------------
variable "scheduled_jobs" {
  description = "EventBridge Scheduler jobs: name => {schedule, path}. Each fires a Lambda that POSTs <api>/<path> with X-Internal-Job-Key."
  type = map(object({
    schedule = string
    path     = string
    timezone = optional(string, "UTC")
    enabled  = optional(bool, true)
  }))
  default = {}
}

variable "opensearch" {
  description = "OpenSearch settings (used when enable_opensearch)."
  type = object({
    engine_version = optional(string, "OpenSearch_2.17")
    instance_type  = optional(string, "t3.small.search")
    instance_count = optional(number, 1)
    volume_gb      = optional(number, 20)
  })
  default = {}
}

variable "redis" {
  description = "ElastiCache Redis settings (used when enable_redis)."
  type = object({
    engine_version = optional(string, "7.1")
    node_type      = optional(string, "cache.t4g.small")
    nodes          = optional(number, 1)
  })
  default = {}
}

# --- Observability ---------------------------------------------------------------------------------------------------
variable "alarm_emails" {
  description = "Email subscribers for alarms (NEEDS_HUMAN: on-call list)."
  type        = list(string)
  default     = []
}

variable "alarm_webhook_urls" {
  description = "HTTPS on-call webhook endpoints (Slack / WhatsApp bridge)."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "Application log retention (HB06: 90)."
  type        = number
  default     = 90
}

variable "budget_usd" {
  description = "Monthly budget for this stack (0 = none)."
  type        = number
  default     = 0
}

# --- Safety-alert delivery alarms ------------------------------------------------------------------------------
variable "safety_alerts" {
  description = "Safety-alert delivery alarms (KX-09: delivered <= 60 s, on-call alarm if undelivered). role = producer (Kiorly Clinic / Nurse) or consumer (Kiorex ops). Reads structured JSON application logs, so it is provider-mode agnostic. alarm_emails / alarm_webhook_urls = dedicated safety on-call rota (NEEDS_HUMAN)."
  type = object({
    enabled              = optional(bool, false)
    role                 = optional(string, "producer")
    latency_threshold_ms = optional(number, 60000)
    alarm_emails         = optional(list(string), [])
    alarm_webhook_urls   = optional(list(string), [])
    watch_job_runner     = optional(bool, false)
  })
  default = {}
}
