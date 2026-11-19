# Contract: database. RDS PostgreSQL 16, PITR, manage_master_user_password, isolated subnets.
# CDK: rds.DatabaseInstance + ParameterGroup(timezone).

resource "aws_security_group" "this" {
  name        = "${var.identifier}-db"
  description = "RDS PostgreSQL - 5432 from app tier only"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = "${var.identifier}-db" })
}

resource "aws_vpc_security_group_ingress_rule" "pg" {
  count                        = length(var.allowed_security_group_ids)
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.allowed_security_group_ids[count.index]
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL from app tier"
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.identifier}-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${var.identifier}-pg16-"
  family      = "postgres${split(".", var.engine_version)[0]}"
  description = "Kiorex PostgreSQL parameters (timezone, TLS only)"

  parameter {
    name  = "timezone"
    value = var.timezone
  }
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = var.tags
  lifecycle {
    create_before_destroy = true
  }
}

# Pre-create the log group so retention is explicit (HB06).
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${var.identifier}/postgresql"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "upgrade" {
  name              = "/aws/rds/instance/${var.identifier}/upgrade"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_db_instance" "this" {
  identifier     = var.identifier
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.storage_gb
  max_allocated_storage = var.max_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.username
  # The master password never enters state: RDS generates it and keeps it in Secrets Manager.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.secret_kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period   = var.backup_days
  delete_automated_backups  = false
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.identifier}-final"
  copy_tags_to_snapshot     = true

  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]
  performance_insights_enabled          = var.performance_insights
  performance_insights_kms_key_id       = var.performance_insights ? var.kms_key_arn : null
  performance_insights_retention_period = var.performance_insights ? 7 : null
  iam_database_authentication_enabled   = true
  auto_minor_version_upgrade            = true

  tags = merge(var.tags, { KiorlyDataClass = "primary-database" })

  depends_on = [aws_cloudwatch_log_group.postgresql, aws_cloudwatch_log_group.upgrade]
}
