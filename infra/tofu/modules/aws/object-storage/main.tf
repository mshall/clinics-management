# Contract: object_storage. S3 bucket: block public, TLS only, versioning, SSE-KMS, lifecycle.
# CDK: s3.Bucket (uploads RETAIN, web DESTROY). Web files are synced by CI instead of BucketDeployment.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  bucket_name = "${var.name}-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
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
        noncurrent_days = var.noncurrent_expiration_days
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
