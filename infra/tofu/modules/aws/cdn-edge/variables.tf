variable "name" {
  description = "Name prefix."
  type        = string
}

variable "comment" {
  description = "Distribution comment."
  type        = string
}

variable "web_bucket_regional_domain_name" {
  description = "Web bucket regional domain name."
  type        = string
}

variable "api_origin_domain" {
  description = "API origin host: App Runner service_url (scheme is stripped if present)."
  type        = string
}

variable "aliases" {
  description = "Custom domain names (CNAMEs)."
  type        = list(string)
  default     = []
}

variable "certificate_arn" {
  description = "ACM certificate ARN in us-east-1 (null = CloudFront default certificate)."
  type        = string
  default     = null
}

variable "web_acl_arn" {
  description = "WAFv2 web ACL ARN (CLOUDFRONT scope). null = none."
  type        = string
  default     = null
}

variable "price_class" {
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
