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

# --- Rev 2.3 / KX-23 Kiorly Nurse + home visits (backlog item 7; nothing applied) ------------------------------
# nurse.kiorly.com alias: OFF in staging (staging uses the CloudFront default domain, so there is no zone/cert to extend).
# Turn on only together with a staging domain, e.g. domain = "app.staging.kiorly.com", nurse_domain = "nurse.staging.kiorly.com".
nurse_alias_enabled = false
nurse_domain        = "nurse.staging.kiorly.com" # placeholder, unused while the alias is off

# Amazon Location: OFF - maps/routing adapter runs in MOCK mode (KIORLY_PROVIDER_MODE=mock). Enable in the Provider go-live pass.
enable_location            = false
location_route_data_source = "Esri"

# Safety-alert delivery alarms: staging runs the field-visit safety drills (stop-ship: alert > 60 s).
safety_alerts = {
  enabled              = true
  role                 = "producer"
  latency_threshold_ms = 60000
  alarm_emails         = [] # NEEDS_HUMAN: safety on-call rota (see README "Safety on-call")
  alarm_webhook_urls   = []
  watch_job_runner     = true
}

# Geostamp retention purge (KX-08: keep coarse geostamps 12 months, then reduce to district only). Infra owns only the clock;
# the API owns the logic and must be idempotent + batched (the runner Lambda times out at 60 s). DISABLED until the API endpoint
# exists and the DPO confirms the retention under PDPL (KX-15).
scheduled_jobs = {
  geostamp-retention-purge = {
    schedule = "cron(15 3 * * ? *)" # daily 03:15 Africa/Cairo
    path     = "/api/v1/internal/jobs/geostamp-retention-purge"
    timezone = "Africa/Cairo"
    enabled  = false
  }
}

enable_demo_seed = true # Q10: staging demo data (non-production only; seeded by hand via scripts/seed-staging.sh)

# HVPRV01: 32-byte AES-256-GCM key for home addresses at rest, generated into Secrets Manager (<name>/home-visit-address-key) and injected as
# HOME_VISIT_ADDRESS_ENCRYPTION_KEY. The API refuses to start in production without it. Do not taint/replace it once visits exist.
enable_home_visit_address_key = true

# HB07 outbound path for third-party APIs. Cost-safe default: no NAT (providers are MOCK until the Provider go-live pass). Switch to
# "nat_single" (~USD 32/month) in staging to test real providers, "nat_per_az" (~USD 65/month) for prod once they are live.
# AWS-only needs (SES API, logs) can use extra_interface_endpoints = ["email"] instead. See Docs/HB07_EGRESS.md.
egress_mode               = "none"
extra_interface_endpoints = []

# ADR-039 telehealth: empty /kiorly-clinic/staging/cloudflare-turn container (value via scripts/setup-telehealth-turn.sh staging)
telehealth_turn_secret = true

# ADR-040 front door: EMPTY container /kiorly-clinic/staging/kiorex-lead-signing. Founder steps (docs: kiorex-platform Docs/NEEDS_HUMAN.md "Partner lead signing secret"):
#   1. tofu apply (creates the container)  2. kiorex-platform/scripts/setup-partner-lead-secret.sh staging  3. set lead_signing_secret_inject = true and apply.
lead_signing_secret        = true
lead_signing_secret_inject = false
