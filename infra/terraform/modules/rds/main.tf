# RDS PostgreSQL — the authoritative store for users, products, inventory,
# carts, orders, payments, refunds, returns, testimonials, etc. Woobe's
# checkout/inventory/coupon logic depends on real row-level locking
# (SELECT ... FOR UPDATE) inside multi-statement transactions, so this
# stays a real PostgreSQL instance, never a simpler managed datastore.
#
# Single-AZ, smallest practical Graviton class, publicly_accessible=false,
# encrypted storage, and — deliberately — no hardcoded password anywhere:
# `manage_master_user_password = true` has RDS create and hold the master
# credential in AWS Secrets Manager directly. Terraform never sees, stores,
# or outputs the plaintext password; only the secret's ARN is exposed.

data "aws_rds_engine_version" "postgres" {
  engine  = "postgres"
  version = "16"
  latest  = true
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = merge(var.tags, { Name = "${var.name_prefix}-db-subnet-group" })
}

resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-postgres"
  engine         = "postgres"
  engine_version = data.aws_rds_engine_version.postgres.version

  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username

  # AWS-managed master password — see module header comment.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.rds_sg_id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period   = var.backup_retention_days
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name_prefix}-postgres-final"

  # Performance Insights: free at 7-day retention, and directly useful
  # given Woobe's checkout/coupon-redemption row-locking pattern — this is
  # exactly the kind of workload where lock-wait visibility matters.
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql"]

  # No custom parameter group: PostgreSQL 16 defaults are sufficient.
  # pg_trgm (used by the app's product-search trigram index) is a contrib
  # extension enabled per-database via `CREATE EXTENSION`, not a
  # parameter-group/shared_preload_libraries setting — there is currently
  # no justified reason to deviate from the default parameter group.

  tags = merge(var.tags, { Name = "${var.name_prefix}-postgres" })
}
