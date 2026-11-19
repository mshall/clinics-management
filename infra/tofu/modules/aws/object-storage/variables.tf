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
  description = "Customer-managed KMS key (SSE-KMS). null = SSE-S3."
  type        = string
  default     = null
}

variable "force_destroy" {
  description = "Allow destroying a non-empty bucket (web bucket / non-prod only)."
  type        = bool
  default     = false
}

variable "noncurrent_expiration_days" {
  description = "Days to keep non-current versions (only when versioning)."
  type        = number
  default     = 90
}

variable "prefix_expiration_days" {
  description = "Lifecycle backstop: key prefix => days until objects expire (e.g. scribe audio)."
  type        = map(number)
  default     = {}
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
