terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "kiorex-tofu-state-staging-euc1" # created by bootstrap/
    key          = "staging/frankfurt/kiorly-clinic/terraform.tfstate"
    region       = "eu-central-1" # same region as the cell
    encrypt      = true           # SSE-KMS on the bucket
    use_lockfile = true           # native S3 locking, no DynamoDB table
  }

  # OpenTofu client-side state + plan encryption (KMS). State describes health-data infrastructure.
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
