output "enabled" {
  description = "Whether Amazon Location resources exist."
  value       = var.enabled
}

output "map_name" {
  description = "Map resource name (null when disabled)."
  value       = one(aws_location_map.this[*].map_name)
}

output "route_calculator_name" {
  description = "Route calculator name (null when disabled)."
  value       = one(aws_location_route_calculator.this[*].calculator_name)
}

output "policy_json" {
  description = "IAM policy JSON for the App Runner instance role (pass in extra_policy_json); null when disabled."
  value       = one(data.aws_iam_policy_document.use[*].json)
}

output "env_vars" {
  description = "Runtime env for the real adapter. Deliberately excludes the mode switch: KIORLY_PROVIDER_MODE stays a human decision."
  value = var.enabled ? {
    LOCATION_MAP_NAME              = aws_location_map.this[0].map_name
    LOCATION_ROUTE_CALCULATOR_NAME = aws_location_route_calculator.this[0].calculator_name
  } : {}
}
