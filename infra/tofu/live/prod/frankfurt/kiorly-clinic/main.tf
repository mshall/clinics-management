# live/prod/frankfurt/kiorly-clinic: one product, one environment, one cell (KX-21 §01).
# All behaviour lives in modules/product-stack; this file only binds it to the cell registry and the provider.

locals {
  cells  = jsondecode(file("${path.root}/../../../../../../platform/data-cells.json")).cells
  cell   = "frankfurt"
  env    = "prod"
  region = local.cells[local.cell].awsRegion
}

provider "aws" {
  region              = local.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Product          = "kiorly-clinic"
      Env              = "prod"
      Owner            = "platform-team"
      CostCenter       = "kiorly-clinic"
      ManagedBy        = "opentofu"
      KiorlyHostCell   = local.cell
      KiorlyDataRegion = local.region
    }
  }
}

# CloudFront certificates (ACM) and the WAF web ACL must live in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Product          = "kiorly-clinic"
      Env              = "prod"
      Owner            = "platform-team"
      CostCenter       = "kiorly-clinic"
      ManagedBy        = "opentofu"
      KiorlyHostCell   = local.cell
      KiorlyDataRegion = local.region
    }
  }
}

# Amazon Location (maps/routes) is a real-provider counterpart of the mock-default adapter: disabled unless enable_location.
module "location" {
  source  = "../../../../modules/aws/location"
  enabled = var.enable_location
  name    = "kiorly-clinic-${local.env}"

  route_data_source = var.location_route_data_source
}

module "kiorly_clinic" {
  source    = "../../../../modules/product-stack"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  product    = "kiorly-clinic"
  env        = "prod"
  cell       = local.cell # precondition: provider region must equal data-cells.json
  cells      = local.cells
  stack_role = "clinic-platform-cell"
  image_tag  = var.git_sha

  domain        = var.domain
  zone_name     = var.zone_name
  alias_domains = var.nurse_alias_enabled ? [var.nurse_domain] : [] # nurse.kiorly.com (KX-08 / KX-23)

  api      = var.api
  db       = var.db
  uploads  = var.uploads
  env_vars = merge(var.env_vars, module.location.env_vars)

  extra_policy_json    = compact([module.location.policy_json])
  runtime_secrets      = var.runtime_secrets
  enable_database      = var.enable_database
  enable_uploads       = var.enable_uploads
  enable_cdn           = var.enable_cdn
  enable_seed_lambda   = var.enable_seed_lambda
  enable_demo_seed     = var.enable_demo_seed
  demo_seed_env        = var.demo_seed_env
  enable_email         = var.enable_email
  email_domain         = var.email_domain
  dmarc_report_address = var.dmarc_report_address
  enable_opensearch    = var.enable_opensearch
  enable_redis         = var.enable_redis
  opensearch           = var.opensearch
  redis                = var.redis

  waf_enabled            = var.waf_enabled
  waf_rules              = jsondecode(file("${path.root}/../../../../../../platform/waf-rules.json"))
  use_cmk                = var.use_cmk
  openai_secret_name     = var.openai_secret_name
  generated_secrets      = var.generated_secrets
  placeholder_secrets    = var.placeholder_secrets
  telehealth_turn_secret = var.telehealth_turn_secret
  scheduled_jobs         = var.scheduled_jobs
  safety_alerts          = var.safety_alerts

  enable_home_visit_address_key = var.enable_home_visit_address_key # HVPRV01
  egress_mode                   = var.egress_mode                   # HB07
  extra_interface_endpoints     = var.extra_interface_endpoints

  alarm_emails          = var.alarm_emails
  alarm_webhook_urls    = var.alarm_webhook_urls
  log_retention_days    = var.log_retention_days
  budget_usd            = var.budget_usd
  observability_enabled = var.observability_enabled
}
