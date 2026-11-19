# Contract: container_service. App Runner + VPC connector + autoscaling + observability + ECR (scan + lifecycle).
# CDK: CfnService, CfnVpcConnector, CfnAutoScalingConfiguration, CfnObservabilityConfiguration, DockerImageAsset.

locals {
  ecr_repos = toset(concat([var.name], tolist(var.extra_ecr_repositories)))
}

# --- ECR (image built + pushed by CI; tag = git sha) --------------------------------------------
resource "aws_ecr_repository" "this" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_delete_repository

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = var.ecr_kms_key_arn == null ? "AES256" : "KMS"
    kms_key         = var.ecr_kms_key_arn
  }

  tags = var.tags
}

resource "aws_ecr_repository" "extra" {
  for_each             = var.extra_ecr_repositories
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"
  force_delete         = var.force_delete_repository

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = var.ecr_kms_key_arn == null ? "AES256" : "KMS"
    kms_key         = var.ecr_kms_key_arn
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = local.ecr_repos
  repository = each.key
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last ${var.ecr_keep_images} images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = var.ecr_keep_images }
      action       = { type = "expire" }
    }]
  })
  depends_on = [aws_ecr_repository.this, aws_ecr_repository.extra]
}

# --- IAM -----------------------------------------------------------------------------------------
data "aws_iam_policy_document" "access_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "access" {
  name               = "${var.name}-apprunner-ecr-access"
  assume_role_policy = data.aws_iam_policy_document.access_trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "access_ecr" {
  role       = aws_iam_role.access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

data "aws_iam_policy_document" "instance_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${var.name}-apprunner-instance"
  description        = "Runtime access to Secrets Manager, S3 and KMS for ${var.name}"
  assume_role_policy = data.aws_iam_policy_document.instance_trust.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "instance_xray" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "instance_scoped" {
  dynamic "statement" {
    for_each = length(var.secret_read_arns) > 0 ? [1] : []
    content {
      sid       = "ReadSecrets"
      actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      resources = var.secret_read_arns
    }
  }
  dynamic "statement" {
    for_each = length(var.bucket_arns) > 0 ? [1] : []
    content {
      sid       = "BucketList"
      actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
      resources = var.bucket_arns
    }
  }
  dynamic "statement" {
    for_each = length(var.bucket_arns) > 0 ? [1] : []
    content {
      sid       = "ObjectReadWrite"
      actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
      resources = [for b in var.bucket_arns : "${b}/*"]
    }
  }
  dynamic "statement" {
    for_each = length(var.kms_key_arns) > 0 ? [1] : []
    content {
      sid       = "UseKeys"
      actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
      resources = var.kms_key_arns
    }
  }
}

data "aws_iam_policy_document" "instance" {
  source_policy_documents = concat([data.aws_iam_policy_document.instance_scoped.json], var.extra_policy_json)
}

resource "aws_iam_role_policy" "instance" {
  name   = "runtime-access"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance.json
}

# --- App Runner -----------------------------------------------------------------------------------
resource "aws_apprunner_vpc_connector" "this" {
  count              = var.enable_vpc_connector ? 1 : 0
  vpc_connector_name = "${var.name}-vpc"
  subnets            = var.connector_subnet_ids
  security_groups    = var.connector_security_group_ids
  tags               = var.tags
}

resource "aws_apprunner_auto_scaling_configuration_version" "this" {
  auto_scaling_configuration_name = "${var.name}-asc"
  max_concurrency                 = var.max_concurrency
  max_size                        = var.max_size
  min_size                        = var.min_size
  tags                            = var.tags
}

resource "aws_apprunner_observability_configuration" "this" {
  observability_configuration_name = "${var.name}-obs"
  trace_configuration {
    vendor = "AWSXRAY"
  }
  tags = var.tags
}

resource "aws_apprunner_service" "this" {
  service_name                   = "${var.name}-api"
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.this.arn

  observability_configuration {
    observability_enabled           = var.observability_enabled
    observability_configuration_arn = aws_apprunner_observability_configuration.this.arn
  }

  source_configuration {
    auto_deployments_enabled = false
    authentication_configuration {
      access_role_arn = aws_iam_role.access.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
      image_repository_type = "ECR"
      image_configuration {
        port                          = tostring(var.port)
        runtime_environment_variables = var.environment
        runtime_environment_secrets   = var.secrets
      }
    }
  }

  instance_configuration {
    cpu               = var.cpu
    memory            = var.memory
    instance_role_arn = aws_iam_role.instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = var.health_path
    interval            = 10
    timeout             = 10
    healthy_threshold   = 1
    unhealthy_threshold = 20 # tolerates long Prisma migrations on boot (KX-21 §09)
  }

  network_configuration {
    ingress_configuration {
      is_publicly_accessible = true
    }
    egress_configuration {
      egress_type       = var.enable_vpc_connector ? "VPC" : "DEFAULT"
      vpc_connector_arn = var.enable_vpc_connector ? aws_apprunner_vpc_connector.this[0].arn : null
    }
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.access_ecr,
    aws_iam_role_policy.instance,
  ]
}
