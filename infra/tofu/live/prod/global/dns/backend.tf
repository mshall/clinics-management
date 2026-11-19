terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "kiorex-tofu-state-prod-euc1" # created by bootstrap/
    key          = "prod/global/dns/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }

  encryption {
    key_provider "aws_kms" "state" {
      kms_key_id = "alias/kiorex-tofu-state"
      region     = "eu-central-1"
      key_spec   = "AES_256"
    }
    method "aes_gcm" "default" {
      keys = key_provider.aws_kms.state
    }
    state {
      method   = method.aes_gcm.default
      enforced = true
    }
    plan {
      method   = method.aes_gcm.default
      enforced = true
    }
  }
}
