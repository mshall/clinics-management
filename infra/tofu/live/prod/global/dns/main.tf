# live/prod/global/dns: Route 53 hosted zones for the ecosystem (+CAA, DNSSEC). Apply BEFORE any prod stack that
# sets `domain`/`zone_name`. Registrar NS delegation and the DNSSEC DS record are manual (NEEDS_HUMAN, HB08/KX19).
# Product stacks create their own ACM certificates and alias records inside their zone.

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Product    = "platform"
      Env        = "prod"
      Owner      = "platform-team"
      CostCenter = "kiorex-platform"
      ManagedBy  = "opentofu"
    }
  }
}

# DNSSEC signing keys must live in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Product    = "platform"
      Env        = "prod"
      Owner      = "platform-team"
      CostCenter = "kiorex-platform"
      ManagedBy  = "opentofu"
    }
  }
}

module "dns" {
  source    = "../../../../modules/aws/dns-certs"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  zones         = { for z in var.zones : z => {} }
  enable_dnssec = var.enable_dnssec
  tags          = { Product = "platform", Env = "prod", KiorlyStackRole = "dns" }
}
