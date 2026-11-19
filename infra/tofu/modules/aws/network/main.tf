# Contract: network. VPC, 2 AZ, public + isolated subnets, NO NAT, S3 gateway + interface endpoints, SGs.
# CDK: ec2.Vpc(maxAzs 2, natGateways 0, restrictDefaultSecurityGroup) + endpoints + SGs.

data "aws_region" "current" {}
data "aws_availability_zones" "this" {
  state = "available"
}

locals {
  azs            = slice(sort(data.aws_availability_zones.this.names), 0, 2)
  public_cidrs   = [for i in range(2) : cidrsubnet(var.cidr, 8, i)]
  isolated_cidrs = [for i in range(2) : cidrsubnet(var.cidr, 8, i + 10)]
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = "${var.name}-vpc" })
}

# Restrict the default security group: no ingress, no egress (CDK restrictDefaultSecurityGroup).
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-default-locked" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-igw" })
}

# Public subnets host the App Runner VPC connector ENIs (same as the CDK stack).
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = local.public_cidrs[count.index]
  map_public_ip_on_launch = true # trivy:ignore:AVD-AWS-0164 connector ENIs live here; CDK parity
  tags                    = merge(var.tags, { Name = "${var.name}-public-${local.azs[count.index]}", Tier = "public" })
}

# Isolated subnets: RDS, interface endpoints, seed Lambda. No route to the internet.
resource "aws_subnet" "isolated" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = local.isolated_cidrs[count.index]
  map_public_ip_on_launch = false
  tags                    = merge(var.tags, { Name = "${var.name}-isolated-${local.azs[count.index]}", Tier = "isolated" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-public" })
}

resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-isolated" })
}

resource "aws_route_table_association" "isolated" {
  count          = 2
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}

# Free S3 gateway endpoint (uploads and assets without NAT).
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.isolated.id]
  tags              = merge(var.tags, { Name = "${var.name}-s3-gw" })
}

# --- Security groups -------------------------------------------------------------------------
resource "aws_security_group" "connector" {
  name        = "${var.name}-apprunner-connector"
  description = "App Runner VPC connector - outbound to RDS and VPC endpoints"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-apprunner-connector" })
}

resource "aws_vpc_security_group_egress_rule" "connector_all" {
  security_group_id = aws_security_group.connector.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Connector egress (RDS, endpoints, third-party APIs)" # trivy:ignore:AVD-AWS-0104
}

resource "aws_security_group" "lambda" {
  name        = "${var.name}-lambda"
  description = "Post-deploy seed Lambda - RDS and VPC endpoints"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-lambda" })
}

resource "aws_vpc_security_group_egress_rule" "lambda_vpc_only" {
  security_group_id = aws_security_group.lambda.id
  ip_protocol       = "-1"
  cidr_ipv4         = var.cidr
  description       = "Lambda egress inside the VPC only (isolated subnets have no internet route)"
}

resource "aws_security_group" "endpoints" {
  name        = "${var.name}-vpce"
  description = "Interface endpoints - 443 from connector and Lambda"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-vpce" })
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_connector" {
  security_group_id            = aws_security_group.endpoints.id
  referenced_security_group_id = aws_security_group.connector.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "AWS SDK calls from App Runner connector"
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_lambda" {
  security_group_id            = aws_security_group.endpoints.id
  referenced_security_group_id = aws_security_group.lambda.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "AWS SDK calls from seed Lambda"
}

# --- Interface endpoints (private DNS on; hostnames also exported as *_VPCE_HOST env vars) -----
resource "aws_vpc_endpoint" "interface" {
  for_each            = var.interface_endpoints
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.isolated[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "${var.name}-${each.key}" })
}
