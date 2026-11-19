output "distribution_id" {
  description = "CloudFront distribution id (cache invalidation after web sync)."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN (OAC bucket policy)."
  value       = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  description = "CloudFront domain name (xxxx.cloudfront.net)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "hosted_zone_id" {
  description = "Route 53 hosted zone id for CloudFront alias records."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}
