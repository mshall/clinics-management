aws_account_id = "REPLACE_WITH_PROD_ACCOUNT_ID" # NEEDS_HUMAN: production account (HB05). Intentionally invalid so plan/apply fails until decided.

# Production hardening defaults (KX-21 §17): HB01 WAF, HB02 db.t4g.medium + Performance Insights, HB03 CMKs +
# versioning, HB04 min 2 instances, HB06 alarms + explicit log retention, HB08 custom domain.
api = {
  cpu             = "1024"
  memory          = "2048"
  min             = 2 # HB04
  max             = 25
  max_concurrency = 100
  health_path     = "/api/v1/health/live"
}

db = {
  engine_version       = "16"
  instance_class       = "db.t4g.medium" # HB02
  multi_az             = true
  backup_days          = 35
  deletion_protection  = true
  skip_final_snapshot  = false
  storage_gb           = 20
  max_storage_gb       = 100
  name                 = "clinic"
  username             = "clinicapp"
  performance_insights = true # HB02
}

uploads = { versioning = true, kms = true } # HB03

env_vars = {
  NODE_ENV             = "production"
  KIORLY_DEPLOY_TARGET = "aws"
  SWAGGER_ENABLED      = "false"
  OPENAI_MODEL         = "gpt-4o-mini"
}

domain             = "app.kiorly.com" # HB08 - requires live/prod/global/dns applied first
zone_name          = "kiorly.com"
waf_enabled        = true  # HB01
use_cmk            = true  # HB03
enable_seed_lambda = false # HB09: never seed demo data in prod
enable_email       = true  # SES mail.kiorly.com (NH-016: DKIM/SPF/DMARC; SES production access is manual)
email_domain       = "mail.kiorly.com"
log_retention_days = 90   # HB06
alarm_emails       = []   # NEEDS_HUMAN: on-call list
alarm_webhook_urls = []   # NEEDS_HUMAN: Slack/WhatsApp bridge
budget_usd         = 0    # NEEDS_HUMAN: monthly budget
openai_secret_name = null # set once the secret exists
