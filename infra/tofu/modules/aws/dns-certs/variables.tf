variable "zones" {
  description = "Hosted zones to create (global/dns stack only). Key = zone name."
  type = map(object({
    comment = optional(string, "")
  }))
  default = {}
}

variable "caa_issuers" {
  description = "CAA issuers allowed for every created zone (KX19)."
  type        = list(string)
  default     = ["amazon.com", "amazonaws.com"]
}

variable "enable_dnssec" {
  description = "Sign created zones with DNSSEC (KMS key in us-east-1). The DS record must then be added at the registrar (NEEDS_HUMAN)."
  type        = bool
  default     = false
}

variable "certificates" {
  description = "ACM certificates for CloudFront (us-east-1), DNS-validated. Key = logical name."
  type = map(object({
    domain  = string
    sans    = optional(list(string), [])
    zone_id = string
  }))
  default = {}
}

variable "create_alias_records" {
  description = "Create A/AAAA alias records pointing at the CloudFront distribution."
  type        = bool
  default     = false
}

variable "alias_records" {
  description = "Alias records: key = logical name."
  type = map(object({
    name    = string
    zone_id = string
  }))
  default = {}
}

variable "cloudfront_domain_name" {
  description = "CloudFront domain name for alias records."
  type        = string
  default     = ""
}

variable "cloudfront_zone_id" {
  description = "CloudFront hosted zone id for alias records."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
