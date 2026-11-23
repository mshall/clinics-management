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

variable "generated_hex_secrets" {
  description = "Secrets that are N random BYTES rendered as lowercase hex (e.g. an AES-256 key: bytes = 32 gives 64 hex chars), stored as JSON {<key>: <hex>}. The generated value is in state (KMS-encrypted client-side). LOSING OR REPLACING such a key makes data encrypted with it unreadable: never taint/destroy it once a tenant exists."
  type = map(object({
    key   = string
    bytes = optional(number, 32)
  }))
  default = {}
}

variable "placeholder_secrets" {
  description = "Secret containers without a value, to be populated by a human (PSP keys, WhatsApp tokens, HMAC client secrets). Values never pass through OpenTofu."
  type        = set(string)
  default     = []
}

variable "named_placeholder_secrets" {
  description = "Like placeholder_secrets but with an EXPLICIT full secret name (not prefixed with var.name), for paths other systems/scripts expect, e.g. /kiorly-clinic/staging/cloudflare-turn (ADR-039). Empty container, populated by a human or script; always a 30-day recovery window; product CMK when one exists. Values never pass through OpenTofu."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for n in var.named_placeholder_secrets : can(regex("^/[A-Za-z0-9/_+=.@-]+$", n))])
    error_message = "named_placeholder_secrets must be absolute secret names such as /kiorly-clinic/staging/cloudflare-turn."
  }
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
