variable "name" {
  description = "Name prefix (e.g. kiorly-clinic-prod). Secrets are named <name>/<secret>."
  type        = string
}

variable "kms_purposes" {
  description = "Customer-managed KMS keys to create (HB03): any of rds, uploads, secrets, alerts. Empty = AWS-managed keys."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for p in var.kms_purposes : contains(["rds", "uploads", "secrets", "alerts"], p)])
    error_message = "kms_purposes may only contain rds, uploads, secrets, alerts."
  }
}

variable "generated_secrets" {
  description = "Secrets generated with random_password and stored as JSON {<key>: <value>}. Map key = secret suffix. (CDK JwtSecret: key jwt, 48 chars.) The generated value is in state - state is KMS-encrypted client-side."
  type = map(object({
    key    = string
    length = optional(number, 48)
  }))
  default = {}
}

variable "placeholder_secrets" {
  description = "Secret containers without a value, to be populated by a human (PSP keys, WhatsApp tokens, HMAC client secrets). Values never pass through OpenTofu."
  type        = set(string)
  default     = []
}

variable "openai_secret_name" {
  description = "Name of an EXISTING Secrets Manager secret holding {apiKey} (created by scripts/configure-apprunner-openai.sh). null = none."
  type        = string
  default     = null
}

variable "recovery_window_days" {
  description = "Secret deletion recovery window (0 = immediate, non-prod only)."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
