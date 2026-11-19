# product-stack: ONE product in ONE cell, composed only from the contract modules (KX-21 §01).
# It never creates an AWS resource for a contract directly; extras (seed Lambda, scheduler, search, cache) are
# explicitly optional, product-specific attachments in the sibling *.tf files.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name = "${var.product}-${var.env}"
  cell = try(var.cells[var.cell], null)

  seed_enabled = var.enable_seed_lambda && var.env != "prod"
  has_jobs     = length(var.scheduled_jobs) > 0
  use_vpc      = var.enable_database || var.enable_seed_lambda || var.enable_opensearch || var.enable_redis
  has_domain   = var.domain != "" && var.enable_cdn
  need_zone    = local.has_domain || (var.enable_email && var.email_domain != "")

  tz = try(local.cell.runtimeTimezone, "UTC")

  tags = merge({
    Product          = var.product
    Env              = var.env
    Owner            = "platform-team"
    CostCenter       = var.product
    KiorlyHostCell   = var.cell
    KiorlyDataRegion = local.region
    KiorlyStackRole  = var.stack_role
  }, var.tags)

  generated_secrets = merge(
    { jwt = { key = "jwt", length = 48 } },
    local.has_jobs ? { internal-jobs = { key = "key", length = 48 } } : {},
    var.generated_secrets,
  )
}

# Data residency guard (KX-21 §04): refuse to deploy a cell to a region other than the registered one.
resource "terraform_data" "cell_guard" {
  input = data.aws_region.current.region

  lifecycle {
    precondition {
      condition     = local.cell != null
      error_message = "Unknown data cell '${var.cell}' - not present in platform/data-cells.json."
    }
    precondition {
      condition     = try(local.cell.awsRegion, "") == data.aws_region.current.region
      error_message = "Data residency: cell '${var.cell}' requires region ${try(local.cell.awsRegion, "?")} but the provider is in ${data.aws_region.current.region}."
    }
    precondition {
      condition     = !(var.env == "prod" && var.enable_seed_lambda)
      error_message = "The demo seed Lambda must never be enabled in production (HB09)."
    }
    precondition {
      condition     = !local.need_zone || var.zone_name != ""
      error_message = "zone_name is required when domain or email is configured."
    }
  }
}

# Everything below uses local.region, so nothing is planned before the residency guard passes.
locals {
  region = terraform_data.cell_guard.output
}

data "aws_route53_zone" "this" {
  count        = local.need_zone && var.zone_name != "" ? 1 : 0
  name         = var.zone_name
  private_zone = false
}

# ---------------------------------------------------------------------------------------------------------
# secrets (+ customer-managed KMS keys)
# ---------------------------------------------------------------------------------------------------------
module "secrets" {
  source = "../aws/secrets"

  name                 = local.name
  kms_purposes         = var.use_cmk ? toset(compact([var.enable_database ? "rds" : "", var.enable_uploads ? "uploads" : "", "secrets", "alerts"])) : toset([])
  generated_secrets    = local.generated_secrets
  placeholder_secrets  = var.placeholder_secrets
  openai_secret_name   = var.openai_secret_name
  recovery_window_days = var.env == "prod" ? 30 : 0
  tags                 = local.tags
}

locals {
  kms = module.secrets.kms_key_arns
}

# ---------------------------------------------------------------------------------------------------------
# network
# ---------------------------------------------------------------------------------------------------------
module "network" {
  count  = local.use_vpc ? 1 : 0
  source = "../aws/network"

  name = local.name
  tags = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# database
# ---------------------------------------------------------------------------------------------------------
module "database" {
  count  = var.enable_database ? 1 : 0
  source = "../aws/database"

  identifier                 = "${local.name}-pg"
  vpc_id                     = module.network[0].vpc_id
  subnet_ids                 = module.network[0].isolated_subnet_ids
  allowed_security_group_ids = [module.network[0].connector_security_group_id, module.network[0].lambda_security_group_id]
  engine_version             = var.db.engine_version
  instance_class             = var.db.instance_class
  multi_az                   = var.db.multi_az
  storage_gb                 = var.db.storage_gb
  max_storage_gb             = var.db.max_storage_gb
  backup_days                = var.db.backup_days
  deletion_protection        = var.db.deletion_protection
  skip_final_snapshot        = var.db.skip_final_snapshot
  performance_insights       = var.db.performance_insights
  db_name                    = var.db.name
  username                   = var.db.username
  timezone                   = local.tz
  kms_key_arn                = try(local.kms["rds"], null)
  secret_kms_key_arn         = try(local.kms["secrets"], null)
  log_retention_days         = var.log_retention_days
  tags                       = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# object storage
# ---------------------------------------------------------------------------------------------------------
module "uploads" {
  count  = var.enable_uploads ? 1 : 0
  source = "../aws/object-storage"

  name                   = "${local.name}-uploads"
  data_class             = "tenant-uploads"
  versioning             = var.uploads.versioning
  kms_key_arn            = var.uploads.kms ? try(local.kms["uploads"], null) : null
  prefix_expiration_days = var.uploads.prefix_expiration_days
  force_destroy          = var.env != "prod" # prod uploads are RETAINed (CDK removalPolicy RETAIN)
  tags                   = local.tags
}

module "web" {
  count  = var.enable_cdn ? 1 : 0
  source = "../aws/object-storage"

  name                        = "${local.name}-web"
  data_class                  = "web-static"
  versioning                  = false
  force_destroy               = true # replaced each deploy (destroyable)
  enable_cloudfront_policy    = true
  cloudfront_distribution_arn = module.cdn[0].distribution_arn
  tags                        = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# email
# ---------------------------------------------------------------------------------------------------------
module "email" {
  count  = var.enable_email ? 1 : 0
  source = "../aws/email"

  domain               = var.email_domain
  zone_id              = one(data.aws_route53_zone.this[*].zone_id)
  dmarc_report_address = var.dmarc_report_address
  tags                 = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# container service (App Runner + ECR)
# ---------------------------------------------------------------------------------------------------------
locals {
  runtime_env = merge(
    {
      PORT               = tostring(var.api.port)
      TZ                 = local.tz
      KIORLY_HOST_CELL   = var.cell
      AWS_REGION         = local.region
      AWS_DEFAULT_REGION = local.region
    },
    local.use_vpc ? {
      SECRETS_MANAGER_VPCE_HOST = module.network[0].vpce_hosts["secretsmanager"]
      KMS_VPCE_HOST             = module.network[0].vpce_hosts["kms"]
      STS_VPCE_HOST             = module.network[0].vpce_hosts["sts"]
    } : {},
    var.enable_database ? {
      DB_SECRET_ARN          = module.database[0].master_secret_arn
      DB_HOST                = module.database[0].address
      DB_PORT                = tostring(module.database[0].port)
      DB_NAME                = module.database[0].db_name
      DB_USER                = module.database[0].username
      PRISMA_MIGRATE_ON_BOOT = "true"
      PRISMA_SEED_ON_BOOT    = "false" # seeding never runs on boot (KX-21 §09)
    } : {},
    var.enable_uploads ? {
      UPLOAD_STORAGE   = "s3"
      S3_UPLOAD_BUCKET = module.uploads[0].bucket_id
    } : {},
    var.env_vars,
  )

  runtime_secrets = merge(
    { JWT_SECRET = module.secrets.secret_field_arns["jwt"] },
    local.has_jobs ? { INTERNAL_JOB_KEY = module.secrets.secret_field_arns["internal-jobs"] } : {},
    module.secrets.openai_secret_arn == null ? {} : { OPENAI_API_KEY = "${module.secrets.openai_secret_arn}:apiKey::" },
    var.runtime_secrets,
  )
}

module "container_service" {
  source = "../aws/container-service"

  name                         = local.name
  image_tag                    = var.image_tag
  port                         = var.api.port
  cpu                          = var.api.cpu
  memory                       = var.api.memory
  min_size                     = var.api.min
  max_size                     = var.api.max
  max_concurrency              = var.api.max_concurrency
  health_path                  = var.api.health_path
  environment                  = local.runtime_env
  secrets                      = local.runtime_secrets
  secret_read_arns             = concat(module.secrets.readable_secret_arns, var.enable_database ? [module.database[0].master_secret_arn] : [])
  bucket_arns                  = var.enable_uploads ? [module.uploads[0].bucket_arn] : []
  kms_key_arns                 = [for k in ["secrets", "uploads"] : local.kms[k] if contains(keys(local.kms), k)]
  extra_policy_json            = concat(var.enable_email ? [module.email[0].send_policy_json] : [], var.extra_policy_json)
  enable_vpc_connector         = local.use_vpc
  connector_subnet_ids         = local.use_vpc ? module.network[0].public_subnet_ids : []
  connector_security_group_ids = local.use_vpc ? [module.network[0].connector_security_group_id] : []
  observability_enabled        = var.observability_enabled
  extra_ecr_repositories       = local.seed_enabled ? ["${local.name}-seed"] : []
  force_delete_repository      = var.env != "prod"
  tags                         = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# edge: WAF + certificate + CloudFront + DNS
# ---------------------------------------------------------------------------------------------------------
module "waf" {
  count     = var.enable_cdn && var.waf_enabled ? 1 : 0
  source    = "../aws/waf"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  name                = local.name
  waf_rules           = var.waf_rules
  geo_count_countries = var.waf_geo_count_countries
  tags                = local.tags
}

module "dns_certs" {
  count     = local.has_domain ? 1 : 0
  source    = "../aws/dns-certs"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  certificates           = { site = { domain = var.domain, zone_id = data.aws_route53_zone.this[0].zone_id } }
  create_alias_records   = true
  alias_records          = { site = { name = var.domain, zone_id = data.aws_route53_zone.this[0].zone_id } }
  cloudfront_domain_name = module.cdn[0].domain_name
  cloudfront_zone_id     = module.cdn[0].hosted_zone_id
  tags                   = local.tags
}

module "cdn" {
  count  = var.enable_cdn ? 1 : 0
  source = "../aws/cdn-edge"

  name                            = local.name
  comment                         = "${var.product} ${var.env} SPA + App Runner API (no ALB/NAT)"
  web_bucket_regional_domain_name = module.web[0].bucket_regional_domain_name
  api_origin_domain               = module.container_service.service_url
  aliases                         = local.has_domain ? [var.domain] : []
  certificate_arn                 = local.has_domain ? module.dns_certs[0].certificate_arns["site"] : null
  web_acl_arn                     = var.waf_enabled ? module.waf[0].web_acl_arn : null
  tags                            = local.tags
}

# ---------------------------------------------------------------------------------------------------------
# observability
# ---------------------------------------------------------------------------------------------------------
module "observability" {
  source = "../aws/observability"

  name                     = local.name
  sns_kms_key_id           = try(local.kms["alerts"], null)
  alarm_emails             = var.alarm_emails
  alarm_webhook_urls       = var.alarm_webhook_urls
  apprunner_service_name   = module.container_service.service_name
  apprunner_service_id     = module.container_service.service_id
  apprunner_max_size       = var.api.max
  rds_identifier           = var.enable_database ? module.database[0].identifier : null
  rds_allocated_storage_gb = var.enable_database ? module.database[0].allocated_storage_gb : 20
  rds_instance_class       = var.db.instance_class
  lambda_function_names    = local.seed_enabled ? ["${local.name}-db-seed"] : []
  log_retention_days       = var.log_retention_days
  budget_usd               = var.budget_usd
  tags                     = local.tags
}
