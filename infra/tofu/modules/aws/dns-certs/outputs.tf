output "zone_ids" {
  description = "Created hosted zone ids keyed by zone name."
  value       = { for k, z in aws_route53_zone.this : k => z.zone_id }
}

output "name_servers" {
  description = "Name servers per created zone - set these at the registrar (NEEDS_HUMAN)."
  value       = { for k, z in aws_route53_zone.this : k => z.name_servers }
}

output "dnssec_ds_records" {
  description = "DS records to publish at the registrar when DNSSEC is enabled."
  value       = { for k, v in aws_route53_key_signing_key.this : k => v.ds_record }
}

output "certificate_arns" {
  description = "Validated ACM certificate ARNs (us-east-1) keyed by logical name."
  value       = { for k, v in aws_acm_certificate_validation.this : k => v.certificate_arn }
}
