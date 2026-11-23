variable "name" {
  description = "Logical bucket name prefix (e.g. kiorly-clinic-prod-uploads). Account id is appended for global uniqueness."
  type        = string
}

variable "data_class" {
  description = "KiorlyDataClass tag value (tenant-uploads | web-static | reports)."
  type        = string
}

variable "versioning" {
  description = "Enable object versioning."
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "Customer-managed KMS key (SSE-KMS). null = SSE-S3 (AES256). Switch later without rewriting objects at rest until re-encrypted."
  type        = string
  default     = null
}

variable "force_destroy" {
  description = "Allow destroying a non-empty bucket (web bucket / non-prod only)."
  type        = bool
  default     = false
}

variable "noncurrent_expiration_days" {
  description = "PROPOSAL default 90: days before non-current versions expire (only when versioning)."
  type        = number
  default     = 90
}

variable "newer_noncurrent_versions" {
  description = "PROPOSAL default 3: keep at least this many newest non-current versions while expiring older ones."
  type        = number
  default     = 3
}

variable "prefix_expiration_days" {
  description = "Lifecycle: key prefix => days until current-version objects expire (e.g. imports/, pending/). Never put clinical current versions here."
  type        = map(number)
  default     = {}
}

variable "intelligent_tiering_after_days" {
  description = "PROPOSAL default 30: transition current versions under intelligent_tiering_prefixes to INTELLIGENT_TIERING after N days. 0 = disable tiering rules."
  type        = number
  default     = 30
}

variable "intelligent_tiering_prefixes" {
  description = "Prefixes whose current versions tier to Intelligent-Tiering (millisecond access). Empty = no tiering rules (web bucket)."
  type        = list(string)
  default     = []
}

variable "intelligent_tiering_min_bytes" {
  description = "PROPOSAL default 131072: skip objects smaller than 128 KiB (Intelligent-Tiering does not monitor them)."
  type        = number
  default     = 131072
}

variable "allowed_origins" {
  description = "CORS AllowedOrigins for browser/presigned PUT/GET (Phase 5). Empty list = do not attach a CORS configuration."
  type        = list(string)
  default     = []
}

variable "enable_inventory" {
  description = "Optional S3 Inventory (daily, CSV) under inventory/ for prefix audits. Off by default (cost)."
  type        = bool
  default     = false
}

variable "enable_storage_metrics" {
  description = "Publish request metrics for the entire bucket (CloudWatch AWS/S3). Storage size metrics are provided by AWS daily regardless."
  type        = bool
  default     = true
}

variable "cloudfront_distribution_arn" {
  description = "When set, an OAC read-only policy for this distribution is added (web bucket)."
  type        = string
  default     = null
}

variable "enable_cloudfront_policy" {
  description = "Static switch for the OAC policy statement (the distribution ARN is only known after apply)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
