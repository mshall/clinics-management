variable "region" {
  description = "Region of the state bucket (same region as the cell: frankfurt = eu-central-1)."
  type        = string
  default     = "eu-central-1"
}

variable "aws_account_id" {
  description = "Target AWS account id (guards against applying bootstrap to the wrong account)."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account id."
  }
}

variable "environments" {
  description = "Environments hosted in THIS account: one state bucket + one apply role each. Single-account today: [staging, prod]. After HB05 multi-account: run per account with a single entry."
  type        = set(string)
  default     = ["staging", "prod"]
  validation {
    condition     = alltrue([for e in var.environments : contains(["staging", "prod"], e)])
    error_message = "environments may contain staging and prod."
  }
}

variable "region_short" {
  description = "Short region code used in the bucket name (kiorex-tofu-state-<env>-<short>)."
  type        = string
  default     = "euc1"
}

variable "state_kms_alias" {
  description = "Alias of the KMS key used for bucket SSE and OpenTofu client-side state encryption (must match backend.tf)."
  type        = string
  default     = "alias/kiorex-tofu-state"
}

variable "github_repos" {
  description = "GitHub repositories allowed to assume the roles. branches = refs allowed for the read-only plan role (PR plans use the pull_request subject)."
  type = map(object({
    branches = list(string)
  }))
  default = {
    "mshall/clinics-management" = { branches = ["main", "kiorex"] }
    "mshall/kiorex-platform"    = { branches = ["main"] }
    "mshall/kiorex-account"     = { branches = ["main"] }
    "mshall/kiorly-pharmacy"    = { branches = ["main"] }
    "mshall/kiorly-lab"         = { branches = ["main"] }
  }
}

variable "admin_principal_arns" {
  description = "Principals (platform admin permission set / break-glass / the identity running bootstrap) that keep access to the state buckets. When non-empty, all other principals are denied except the CI roles."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Extra tags."
  type        = map(string)
  default     = {}
}
