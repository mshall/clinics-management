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

# --- Rev 2.3 / KX-23 Kiorly Nurse + home visits (backlog item 7; nothing applied) ------------------------------
# nurse.kiorly.com = alias of this stack (KX-08): extra ACM SAN + CloudFront alternate domain + Route 53 A/AAAA in zone kiorly.com.
# Requires live/prod/global/dns applied first. NOTE: adding a SAN replaces the ACM certificate (create_before_destroy).
nurse_alias_enabled = true
nurse_domain        = "nurse.kiorly.com"

# Amazon Location: OFF until the Provider go-live pass (mock adapter by default, KIORLY_PROVIDER_MODE=mock).
enable_location            = false
location_route_data_source = "Esri"

# Safety-alert delivery alarms (stop-ship: alert > 60 s). The dedicated safety on-call rota is NEEDS_HUMAN.
safety_alerts = {
  enabled              = true
  role                 = "producer"
  latency_threshold_ms = 60000
  alarm_emails         = [] # NEEDS_HUMAN: safety on-call rota (see README "Safety on-call")
  alarm_webhook_urls   = [] # NEEDS_HUMAN: pager / WhatsApp bridge
  watch_job_runner     = true
}

# Geostamp retention purge (KX-08: 12 months, then district only). DISABLED by default; enable after the API endpoint ships and
# the DPO confirms retention under PDPL (KX-15). Infra owns only the clock.
scheduled_jobs = {
  geostamp-retention-purge = {
    schedule = "cron(15 3 * * ? *)" # daily 03:15 Africa/Cairo
    path     = "/api/v1/internal/jobs/geostamp-retention-purge"
    timezone = "Africa/Cairo"
    enabled  = false
  }
}

enable_demo_seed = false # Q10: never seed demo data in prod (the plan fails if this is true)

# HVPRV01: 32-byte AES-256-GCM key for home addresses at rest, generated into Secrets Manager (<name>/home-visit-address-key) and injected as
# HOME_VISIT_ADDRESS_ENCRYPTION_KEY. The API refuses to start in production without it. Do not taint/replace it once visits exist.
enable_home_visit_address_key = true

# HB07 outbound path for third-party APIs. Cost-safe default: no NAT (providers are MOCK until the Provider go-live pass). Switch to
# "nat_single" (~USD 32/month) in staging to test real providers, "nat_per_az" (~USD 65/month) for prod once they are live.
# AWS-only needs (SES API, logs) can use extra_interface_endpoints = ["email"] instead. See Docs/HB07_EGRESS.md.
egress_mode               = "none"
extra_interface_endpoints = []

# ADR-039 telehealth: empty /kiorly-clinic/prod/cloudflare-turn container (value via scripts/setup-telehealth-turn.sh prod)
telehealth_turn_secret = true

# ADR-040 front door: EMPTY container /kiorly-clinic/prod/kiorex-lead-signing. Founder steps (docs: kiorex-platform Docs/NEEDS_HUMAN.md "Partner lead signing secret"):
#   1. tofu apply (creates the container)  2. kiorex-platform/scripts/setup-partner-lead-secret.sh prod  3. set lead_signing_secret_inject = true and apply.
lead_signing_secret        = true
lead_signing_secret_inject = false
