# Optional attachments, disabled by default (KX-21 §08): OpenSearch from M9, ElastiCache Redis when the slot cache needs it.
# Both live in the isolated subnets and accept traffic only from the App Runner connector security group.
# NOTE: VPC-mode OpenSearch needs the service-linked role `AWSServiceRoleForAmazonOpenSearchService` in the account
# (created automatically the first time via console/CLI: `aws iam create-service-linked-role --aws-service-name opensearchservice.amazonaws.com`).

resource "aws_security_group" "search" {
  count       = var.enable_opensearch ? 1 : 0
  name        = "${local.name}-search"
  description = "OpenSearch - 443 from the App Runner connector"
  vpc_id      = module.network[0].vpc_id
  tags        = merge(local.tags, { Name = "${local.name}-search" })
}

resource "aws_vpc_security_group_ingress_rule" "search" {
  count                        = var.enable_opensearch ? 1 : 0
  security_group_id            = aws_security_group.search[0].id
  referenced_security_group_id = module.network[0].connector_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS from App Runner connector"
}

resource "aws_opensearch_domain" "this" {
  count          = var.enable_opensearch ? 1 : 0
  domain_name    = substr("${local.name}-search", 0, 28)
  engine_version = var.opensearch.engine_version

  cluster_config {
    instance_type          = var.opensearch.instance_type
    instance_count         = var.opensearch.instance_count
    zone_awareness_enabled = var.opensearch.instance_count > 1
    dynamic "zone_awareness_config" {
      for_each = var.opensearch.instance_count > 1 ? [1] : []
      content {
        availability_zone_count = 2
      }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch.volume_gb
  }

  vpc_options {
    subnet_ids         = slice(module.network[0].isolated_subnet_ids, 0, var.opensearch.instance_count > 1 ? 2 : 1)
    security_group_ids = [aws_security_group.search[0].id]
  }

  encrypt_at_rest {
    enabled = true
  }
  node_to_node_encryption {
    enabled = true
  }
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-PFS-2023-10"
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = module.container_service.instance_role_arn }
      Action    = "es:ESHttp*"
      Resource  = "arn:aws:es:${local.region}:${data.aws_caller_identity.current.account_id}:domain/${substr("${local.name}-search", 0, 28)}/*"
    }]
  })

  tags = local.tags
}

resource "aws_security_group" "redis" {
  count       = var.enable_redis ? 1 : 0
  name        = "${local.name}-redis"
  description = "ElastiCache Redis - 6379 from the App Runner connector"
  vpc_id      = module.network[0].vpc_id
  tags        = merge(local.tags, { Name = "${local.name}-redis" })
}

resource "aws_vpc_security_group_ingress_rule" "redis" {
  count                        = var.enable_redis ? 1 : 0
  security_group_id            = aws_security_group.redis[0].id
  referenced_security_group_id = module.network[0].connector_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "Redis from App Runner connector"
}

resource "aws_elasticache_subnet_group" "redis" {
  count      = var.enable_redis ? 1 : 0
  name       = "${local.name}-redis"
  subnet_ids = module.network[0].isolated_subnet_ids
  tags       = local.tags
}

resource "aws_elasticache_replication_group" "redis" {
  count                      = var.enable_redis ? 1 : 0
  replication_group_id       = substr("${local.name}-redis", 0, 40)
  description                = "${local.name} slot cache"
  engine                     = "redis"
  engine_version             = var.redis.engine_version
  node_type                  = var.redis.node_type
  num_cache_clusters         = var.redis.nodes
  automatic_failover_enabled = var.redis.nodes > 1
  multi_az_enabled           = var.redis.nodes > 1
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis[0].name
  security_group_ids         = [aws_security_group.redis[0].id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  tags                       = local.tags
}
