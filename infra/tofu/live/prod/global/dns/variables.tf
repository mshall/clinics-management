variable "aws_account_id" {
  description = "Account that owns the zones (Shared services, HB05). NEEDS_HUMAN."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account id."
  }
}

variable "zones" {
  description = "Hosted zones to create."
  type        = list(string)
}

variable "enable_dnssec" {
  description = "Sign the zones with DNSSEC (DS record then goes to the registrar)."
  type        = bool
  default     = true
}
