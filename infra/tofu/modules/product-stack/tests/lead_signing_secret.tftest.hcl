# ADR-040: the partner-lead signing secret is an EMPTY container with an explicit name, 30-day recovery, wired into the runtime env only on request. Offline: `tofu test`.
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "eu-central-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["eu-central-1a", "eu-central-1b", "eu-central-1c"], zone_ids = ["euc1-az1", "euc1-az2", "euc1-az3"] }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:eu-central-1:123456789012:mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-central-1:123456789012:secret:mock-abcdef" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = { arn = "arn:aws:ecr:eu-central-1:123456789012:repository/mock", repository_url = "123456789012.dkr.ecr.eu-central-1.amazonaws.com/mock" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock" }
  }
  mock_resource "aws_db_instance" {
    defaults = { arn = "arn:aws:rds:eu-central-1:123456789012:db:mock", master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:123456789012:secret:rds-mock-abcdef", kms_key_id = "mock", secret_status = "active" }] }
  }
  mock_resource "aws_apprunner_auto_scaling_configuration_version" {
    defaults = { arn = "arn:aws:apprunner:eu-central-1:123456789012:resource/mock/1/abcdef" }
  }
  mock_resource "aws_apprunner_observability_configuration" {
    defaults = { arn = "arn:aws:apprunner:eu-central-1:123456789012:resource/mock/1/abcdef" }
  }
  mock_resource "aws_apprunner_vpc_connector" {
    defaults = { arn = "arn:aws:apprunner:eu-central-1:123456789012:resource/mock/1/abcdef" }
  }
  mock_resource "aws_vpc_endpoint" {
    defaults = { dns_entry = [{ dns_name = "vpce-mock.amazonaws.com", hosted_zone_id = "Z1MOCK" }] }
  }
  mock_resource "aws_vpc" {
    defaults = { arn = "arn:aws:ec2:eu-central-1:123456789012:vpc/vpc-0123456789abcdef0" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
}
mock_provider "aws" {
  alias = "us_east_1"
}

variables {
  product    = "kiorly-clinic"
  cell       = "frankfurt"
  cells      = { frankfurt = { awsRegion = "eu-central-1", runtimeTimezone = "Europe/Berlin" } }
  image_tag  = "test"
  enable_cdn = false
  env        = "staging"
}

run "off_by_default_creates_nothing" {
  command = plan
  assert {
    condition     = length(module.secrets.named_placeholder_secret_arns) == 0 || !contains(keys(module.secrets.named_placeholder_secret_arns), "/kiorly-clinic/staging/kiorex-lead-signing")
    error_message = "the lead signing container must not exist unless lead_signing_secret = true"
  }
}

run "container_only_is_empty_and_not_wired" {
  command = plan
  variables {
    lead_signing_secret = true
  }
  assert {
    condition     = contains(keys(module.secrets.named_placeholder_secret_arns), "/kiorly-clinic/staging/kiorex-lead-signing")
    error_message = "the empty explicit-name container must be planned (30-day recovery is fixed in modules/aws/secrets)"
  }
  assert {
    condition     = length([for k, v in local.runtime_secrets : k if k == "KIOREX_LEAD_SIGNING_SECRET"]) == 0
    error_message = "KIOREX_LEAD_SIGNING_SECRET must not be wired until lead_signing_secret_inject = true (an empty secret would stop App Runner)"
  }
}

run "inject_wires_the_exact_variable_name" {
  command = plan
  variables {
    lead_signing_secret        = true
    lead_signing_secret_inject = true
  }
  assert {
    condition     = contains(keys(local.runtime_secrets), "KIOREX_LEAD_SIGNING_SECRET")
    error_message = "KIOREX_LEAD_SIGNING_SECRET must be a runtime secret reference once injected"
  }
}

run "inject_without_container_wires_nothing" {
  command = plan
  variables {
    lead_signing_secret_inject = true
  }
  assert {
    condition     = !contains(keys(local.runtime_secrets), "KIOREX_LEAD_SIGNING_SECRET")
    error_message = "inject alone must not reference a container that does not exist"
  }
}
