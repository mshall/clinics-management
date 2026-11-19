# Contract: cdn_edge. CloudFront, OAC, Function (SPA rewrite), /api/* behaviour -> App Runner service_url.
# CDK: cloudfront.Distribution + Function + origin-host-parser Lambda (retired: service_url is a plain attribute).

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

locals {
  s3_origin_id  = "web-s3"
  api_origin_id = "api-apprunner"
  api_host      = trimsuffix(trimprefix(trimprefix(var.api_origin_domain, "https://"), "http://"), "/")
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web-oac"
  description                       = "OAC for ${var.name} web bucket (S3 is never public)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SPA deep links: serve index.html for paths without a file extension; leave /api/* unchanged.
# Do NOT use distribution-wide custom error responses - they would rewrite API JSON errors to HTML.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "SPA deep links: index.html for extension-less paths; /api/* untouched"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri || "";
      if (uri.startsWith("/api")) {
        return request;
      }
      if (uri.indexOf(".") !== -1) {
        return request;
      }
      request.uri = "/index.html";
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = var.comment
  default_root_object = "index.html"
  price_class         = var.price_class
  http_version        = "http2and3"
  aliases             = var.aliases
  web_acl_id          = var.web_acl_arn

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = var.web_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.api_host
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # New deploys visible immediately; build id drives client refresh.
  ordered_cache_behavior {
    path_pattern               = "/build-id.json"
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  ordered_cache_behavior {
    path_pattern               = "/index.html"
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.certificate_arn == null
    acm_certificate_arn            = var.certificate_arn
    ssl_support_method             = var.certificate_arn == null ? null : "sni-only"
    minimum_protocol_version       = var.certificate_arn == null ? null : "TLSv1.2_2021"
  }

  tags = var.tags
}
