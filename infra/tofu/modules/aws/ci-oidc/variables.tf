variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider (once per AWS account)."
  type        = bool
  default     = true
}

variable "roles" {
  description = "IAM roles assumable by GitHub Actions. subjects are full OIDC `sub` claims, e.g. repo:org/repo:environment:production."
  type = map(object({
    description          = string
    subjects             = list(string)
    managed_policy_arns  = optional(list(string), [])
    inline_policy_json   = optional(string)
    max_session_duration = optional(number, 3600)
  }))
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
