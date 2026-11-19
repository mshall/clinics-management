aws_account_id = "599243104052" # Kiorex account (aws-kiorex-profile), eu-central-1

# Staging: cheap, greenfield parity test (T3). Same shape as prod, smaller.
api = {
  cpu             = "1024"
  memory          = "2048"
  min             = 1
  max             = 4
  max_concurrency = 100
  health_path     = "/api/v1/health/live"
}

db = {
  engine_version       = "16"
  instance_class       = "db.t4g.micro"
  multi_az             = false
  backup_days          = 7
  deletion_protection  = false
  skip_final_snapshot  = true
  storage_gb           = 20
  max_storage_gb       = 50
  name                 = "clinic"
  username             = "clinicapp"
  performance_insights = false
}

uploads = { versioning = true, kms = true }

env_vars = {
  NODE_ENV             = "production"
  KIORLY_DEPLOY_TARGET = "aws"
  SWAGGER_ENABLED      = "false"
  OPENAI_MODEL         = "gpt-4o-mini"
}

domain             = ""    # CloudFront default domain in staging
waf_enabled        = false # staging: WAF off to save cost; prod has it on (HB01)
use_cmk            = true
enable_seed_lambda = true # demo seed - non-production only (HB09)
log_retention_days = 30
alarm_emails       = [] # NEEDS_HUMAN: on-call list

# Pre-existing secret {apiKey} created by scripts/configure-apprunner-openai.sh (name = <stack>/openai-api-key).
# Set to the secret name once it exists, otherwise OPENAI_API_KEY is not injected.
openai_secret_name = null
