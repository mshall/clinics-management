# Q10: the demo-data seed can never be enabled for env = prod. Offline (mock provider): `tofu test` in this directory.
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
}

run "prod_refuses_demo_seed" {
  command = plan
  variables {
    env              = "prod"
    enable_demo_seed = true
    enable_database  = true
  }
  expect_failures = [terraform_data.demo_seed_guard]
}

run "demo_seed_needs_a_database" {
  command = plan
  variables {
    env              = "staging"
    enable_demo_seed = true
    enable_database  = false
  }
  expect_failures = [terraform_data.demo_seed_guard]
}

run "staging_creates_the_seed_lambda" {
  command = plan
  variables {
    env              = "staging"
    enable_demo_seed = true
    enable_database  = true
  }
  assert {
    condition     = length(aws_lambda_function.demo_seed) == 1
    error_message = "staging with enable_demo_seed must plan the demo seed Lambda"
  }
  assert {
    condition     = aws_lambda_function.demo_seed[0].image_config[0].command[0] == "demo-seed.handler"
    error_message = "the demo seed Lambda must use the demo-seed handler"
  }
}

run "default_creates_nothing" {
  command = plan
  variables {
    env = "staging"
  }
  assert {
    condition     = length(aws_lambda_function.demo_seed) == 0
    error_message = "enable_demo_seed defaults to false"
  }
}
