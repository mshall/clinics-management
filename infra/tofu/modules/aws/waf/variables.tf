variable "name" {
  description = "Web ACL name prefix."
  type        = string
}

variable "waf_rules" {
  description = "Decoded platform/waf-rules.json (object with a rules list). Rule ids are mapped to WAFv2 statements here; unknown ids are ignored."
  type = object({
    rules = list(object({
      id     = string
      action = string
    }))
  })
}

variable "rate_limit" {
  description = "Rate-based limit per IP per 5 minutes on auth/signup paths (rate-public-auth)."
  type        = number
  default     = 100
}

variable "rate_limited_path_prefixes" {
  description = "URI path prefixes covered by the auth/signup rate rule."
  type        = list(string)
  default     = ["/api/v1/auth/", "/api/v1/signup/"]
}

variable "geo_count_countries" {
  description = "ISO country codes for the optional COUNT-only geo rule (abuse investigation, not a residency control). Empty = rule omitted."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
