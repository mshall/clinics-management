output "web_acl_arn" {
  description = "WebACL ARN to attach to the CloudFront distribution."
  value       = aws_wafv2_web_acl.this.arn
}

output "web_acl_name" {
  description = "WebACL name."
  value       = aws_wafv2_web_acl.this.name
}
