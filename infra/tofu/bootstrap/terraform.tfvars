# Kiorex AWS account used by the `kiorex` branch pipeline (profile aws-kiorex-profile, eu-central-1).
aws_account_id = "599243104052"
region         = "eu-central-1"
environments   = ["staging", "prod"] # single account today; split per account with HB05

# Identities that keep access to the state buckets besides the CI roles (restriction active when non-empty).
# NEEDS_HUMAN: replace with the platform admin SSO permission-set role once IAM Identity Center exists (HB05).
admin_principal_arns = [
  "arn:aws:iam::599243104052:user/cursor-admin",
]
