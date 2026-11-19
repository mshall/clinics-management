variable "name" {
  description = "Name prefix for every resource (e.g. kiorly-clinic-prod)."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR. /24 public and isolated subnets are carved out of it (two AZs)."
  type        = string
  default     = "10.20.0.0/16"
}

variable "interface_endpoints" {
  description = "AWS APIs reached privately through interface endpoints (no NAT). KX-21 §05: Secrets Manager, KMS, STS."
  type        = set(string)
  default     = ["secretsmanager", "kms", "sts"]
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
