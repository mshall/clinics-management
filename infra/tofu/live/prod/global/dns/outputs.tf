output "zone_ids" {
  description = "Hosted zone ids."
  value       = module.dns.zone_ids
}

output "name_servers" {
  description = "Delegate these at the registrar (NEEDS_HUMAN)."
  value       = module.dns.name_servers
}

output "dnssec_ds_records" {
  description = "DS records for the registrar."
  value       = module.dns.dnssec_ds_records
}
