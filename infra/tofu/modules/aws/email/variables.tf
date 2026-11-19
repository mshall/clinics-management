variable "enabled" {
  description = "Create the SES identity."
  type        = bool
  default     = true
}

variable "domain" {
  description = "Sending domain (e.g. mail.kiorly.com)."
  type        = string
}

variable "zone_id" {
  description = "Route 53 hosted zone id for DKIM/SPF/DMARC records. null = records are not created (publish manually)."
  type        = string
  default     = null
}

variable "dmarc_policy" {
  description = "DMARC policy (none | quarantine | reject)."
  type        = string
  default     = "quarantine"
}

variable "dmarc_report_address" {
  description = "mailto: address for DMARC aggregate reports (NEEDS_HUMAN)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
