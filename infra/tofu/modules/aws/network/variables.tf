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

variable "egress_mode" {
  description = <<-EOT
    HB07 outbound path for the App Runner VPC connector (third-party APIs: WhatsApp Cloud API, Paymob/Fawry, OpenAI EU, SES).
    none        (default, cost-safe) no NAT: connector ENIs stay in the public subnets, only AWS APIs through the VPC endpoints work.
                Correct while every provider adapter runs in MOCK mode (CLAUDE.md). Costs USD 0.
    nat_single  ONE NAT gateway (one AZ) + private "app" subnets for the connector: about USD 32/month + USD 0.045/GB. Cheapest real path.
    nat_per_az  one NAT gateway per AZ: about USD 65/month + data, no cross-AZ dependency (prod once real providers are live).
    See Docs/HB07_EGRESS.md.
  EOT
  type        = string
  default     = "none"
  validation {
    condition     = contains(["none", "nat_single", "nat_per_az"], var.egress_mode)
    error_message = "egress_mode must be none, nat_single or nat_per_az."
  }
}

variable "extra_interface_endpoints" {
  description = "Additional AWS-API interface endpoints (e.g. email for the SES API, logs). Each costs about USD 7.3/month per AZ. AWS services only - third-party APIs need egress_mode != none."
  type        = set(string)
  default     = []
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
