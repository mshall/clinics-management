# HB07 egress mode + HVPRV01 address key (offline, mock provider): `tofu test` in this directory.
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
  product         = "kiorly-clinic"
  env             = "staging"
  cell            = "frankfurt"
  cells           = { frankfurt = { awsRegion = "eu-central-1", runtimeTimezone = "Europe/Berlin" } }
  image_tag       = "test"
  enable_cdn      = false
  enable_database = true
}

run "default_has_no_nat_and_no_cost" {
  command = plan
  assert {
    condition     = length(module.network[0].nat_public_ips) == 0
    error_message = "egress_mode defaults to none: no NAT gateway / EIP"
  }
  assert {
    condition     = module.network[0].egress_mode == "none"
    error_message = "default egress mode must be none (cost-safe)"
  }
}

run "nat_single_plans_one_gateway" {
  command = plan
  variables {
    egress_mode = "nat_single"
  }
  assert {
    condition     = length(module.network[0].nat_public_ips) == 1
    error_message = "nat_single must plan exactly one NAT gateway"
  }
}

run "nat_per_az_plans_two_gateways" {
  command = plan
  variables {
    egress_mode = "nat_per_az"
  }
  assert {
    condition     = length(module.network[0].nat_public_ips) == 2
    error_message = "nat_per_az must plan one NAT gateway per AZ"
  }
}

run "unknown_egress_mode_is_rejected" {
  command = plan
  variables {
    egress_mode = "internet-gateway-for-everything"
  }
  expect_failures = [var.egress_mode]
}

run "extra_endpoints_are_added_on_top_of_the_defaults" {
  command = plan
  variables {
    extra_interface_endpoints = ["email"]
  }
  assert {
    condition     = length(module.network[0].vpce_hosts) == 4
    error_message = "secretsmanager, kms, sts + the extra email endpoint"
  }
}

run "home_visit_address_key_is_generated_when_enabled" {
  command = plan
  variables {
    enable_home_visit_address_key = true
  }
  assert {
    condition     = contains(keys(module.secrets.secret_field_arns), "home-visit-address-key")
    error_message = "the HOME_VISIT_ADDRESS_ENCRYPTION_KEY secret must be planned when enabled"
  }
}

run "home_visit_address_key_is_off_for_other_products_by_default" {
  command = plan
  assert {
    condition     = !contains(keys(module.secrets.secret_field_arns), "home-visit-address-key")
    error_message = "the key is only generated when enable_home_visit_address_key is set"
  }
}
