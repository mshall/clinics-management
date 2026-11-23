# Contract: object_storage. S3 bucket: block public, TLS only, versioning, SSE-S3/KMS, lifecycle, optional CORS/inventory/alarms.
# CDK twin: infra/src/kiorly-clinics-management-stack.ts ApiUploadsBucket (still live until T5).
# Access logging: intentionally off (cost). CloudTrail data events remain optional at the account level.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  bucket_name = "${var.name}-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
  # Stable rule ids for clinical Intelligent-Tiering (one rule per prefix).
  tier_prefixes = var.intelligent_tiering_after_days > 0 ? var.intelligent_tiering_prefixes : []
  cors_enabled  = length(var.allowed_origins) > 0
}

resource "aws_s3_bucket" "this" {
  bucket        = local.bucket_name
  force_destroy = var.force_destroy
  tags          = merge(var.tags, { KiorlyDataClass = var.data_class })
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = var.versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    bucket_key_enabled = var.kms_key_arn != null
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.kms_key_arn == null ? "AES256" : "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

# -------------------------------------------------------------------------------------------------
# Lifecycle (Phase 1). Clinical current versions under patients|encounters|operations|clinicians are
# never expired here — only the application purge job (Phase 4) may remove them.
# -------------------------------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = var.versioning ? [1] : []
    content {
      id     = "expire-noncurrent-versions"
      status = "Enabled"
      filter {}
      noncurrent_version_expiration {
        noncurrent_days           = var.noncurrent_expiration_days
        newer_noncurrent_versions = var.newer_noncurrent_versions
      }
    }
  }

  dynamic "rule" {
    for_each = var.versioning ? [1] : []
    content {
      id     = "expire-delete-markers"
      status = "Enabled"
      filter {}
      expiration {
        expired_object_delete_marker = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.tier_prefixes
    content {
      id     = "tier-to-intelligent-${replace(trimsuffix(rule.value, "/"), "/", "-")}"
      status = "Enabled"
      filter {
        and {
          prefix                   = rule.value
          object_size_greater_than = var.intelligent_tiering_min_bytes
        }
      }
      transition {
        days          = var.intelligent_tiering_after_days
        storage_class = "INTELLIGENT_TIERING"
      }
    }
  }

  dynamic "rule" {
    for_each = var.prefix_expiration_days
    content {
      id     = "expire-${replace(trimsuffix(rule.key, "/"), "/", "-")}"
      status = "Enabled"
      filter {
        prefix = rule.key
      }
      expiration {
        days = rule.value
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

# -------------------------------------------------------------------------------------------------
# CORS (Phase 5 prep). Origins empty ⇒ no configuration (avoids open CORS).
# -------------------------------------------------------------------------------------------------
resource "aws_s3_bucket_cors_configuration" "this" {
  count  = local.cors_enabled ? 1 : 0
  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_headers = [
      "Content-Type",
      "Content-MD5",
      "x-amz-checksum-sha256",
      "x-amz-meta-*",
    ]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# -------------------------------------------------------------------------------------------------
# Request metrics (EntireBucket). Daily BucketSizeBytes / NumberOfObjects are AWS-managed.
# -------------------------------------------------------------------------------------------------
resource "aws_s3_bucket_metric" "entire_bucket" {
  count  = var.enable_storage_metrics ? 1 : 0
  bucket = aws_s3_bucket.this.id
  name   = "EntireBucket"
}

# -------------------------------------------------------------------------------------------------
# Optional Inventory (prefix audit). Destination = this bucket under inventory/ (TLS + SSE already).
# -------------------------------------------------------------------------------------------------
resource "aws_s3_bucket_inventory" "this" {
  count  = var.enable_inventory ? 1 : 0
  bucket = aws_s3_bucket.this.id
  name   = "daily-all-objects"

  included_object_versions = "Current"
  schedule {
    frequency = "Daily"
  }
  destination {
    bucket {
      format     = "CSV"
      bucket_arn = aws_s3_bucket.this.arn
      prefix     = "inventory"
    }
  }
  optional_fields = [
    "Size",
    "LastModifiedDate",
    "StorageClass",
    "ETag",
    "IntelligentTieringAccessTier",
  ]
}

data "aws_iam_policy_document" "this" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_cloudfront_policy ? [1] : []
    content {
      sid       = "AllowCloudFrontOACRead"
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.this.arn}/*"]
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      condition {
        test     = "StringEquals"
        variable = "AWS:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket     = aws_s3_bucket.this.id
  policy     = data.aws_iam_policy_document.this.json
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# -------------------------------------------------------------------------------------------------
# Dashboard (uploads only). Growth alarm lives in product-stack (needs observability SNS ARN,
# which is created after App Runner and therefore after this module).
# -------------------------------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "storage" {
  count          = var.data_class == "tenant-uploads" ? 1 : 0
  dashboard_name = "${replace(var.name, "/", "-")}-storage"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Uploads bucket size by storage class"
          region = data.aws_region.current.region
          view   = "timeSeries"
          period = 86400
          metrics = [
            ["AWS/S3", "BucketSizeBytes", "BucketName", aws_s3_bucket.this.id, "StorageType", "StandardStorage"],
            ["...", "IntelligentTieringFAStorage"],
            ["...", "IntelligentTieringIAStorage"],
            ["...", "IntelligentTieringAAStorage"],
            ["...", "IntelligentTieringAIAStorage"],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Object count"
          region = data.aws_region.current.region
          view   = "timeSeries"
          period = 86400
          metrics = [
            ["AWS/S3", "NumberOfObjects", "BucketName", aws_s3_bucket.this.id, "StorageType", "AllStorageTypes"],
          ]
        }
      }
    ]
  })
}
