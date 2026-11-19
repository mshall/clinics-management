terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  # One-time, per AWS account. State of this root is LOCAL on first apply (it creates the bucket that holds
  # every other state). After apply, optionally migrate it:
  #   add a backend "s3" block pointing at the new bucket (key = "bootstrap/terraform.tfstate") and run
  #   `tofu init -migrate-state`. Keep the local state file out of git (see ../.gitignore).
}
