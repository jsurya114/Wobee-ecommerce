# Basic CloudWatch monitoring — the small, cost-conscious set explicitly
# scoped for Phase 1: EC2 CPU + status checks, RDS CPU/storage/connections/
# memory. All of these are standard CloudWatch metrics (free at 5-minute
# granularity); alarms themselves cost a fraction of a cent each per month.
#
# EBS volume health/usage at the OS-disk-usage level would require
# installing the CloudWatch agent on the instance, which Phase 1's user_data
# deliberately does not do (keeping the boot script minimal, per the brief's
# own "do not build a huge observability stack yet" instruction). This is a
# documented gap, not an oversight — revisit alongside actual application
# deployment, since the agent's config is more naturally owned by whatever
# deploys the app containers.

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
  tags = merge(var.tags, { Name = "${var.name_prefix}-alerts" })
}

resource "aws_sns_topic_subscription" "alert_email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ---- EC2 --------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ec2_cpu_high" {
  alarm_name          = "${var.name_prefix}-ec2-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Woobe backend EC2 sustained CPU above 80% for 15 minutes"
  dimensions          = { InstanceId = var.ec2_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ec2_status_check_failed" {
  alarm_name          = "${var.name_prefix}-ec2-status-check-failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Woobe backend EC2 failing system or instance status checks"
  dimensions          = { InstanceId = var.ec2_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

# ---- RDS --------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.name_prefix}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Woobe RDS sustained CPU above 80% for 15 minutes"
  dimensions          = { DBInstanceIdentifier = var.rds_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  alarm_name          = "${var.name_prefix}-rds-free-storage-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2147483648 # 2 GiB, in bytes
  alarm_description   = "Woobe RDS free storage below 2 GiB"
  dimensions          = { DBInstanceIdentifier = var.rds_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "${var.name_prefix}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 40 # db.t4g.micro's practical connection ceiling is low; tune once load testing establishes real numbers
  alarm_description   = "Woobe RDS connection count trending toward the small instance's practical ceiling"
  dimensions          = { DBInstanceIdentifier = var.rds_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory_low" {
  alarm_name          = "${var.name_prefix}-rds-freeable-memory-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 100000000 # ~100 MB — tight given a micro instance's 1 GiB total RAM
  alarm_description   = "Woobe RDS freeable memory critically low"
  dimensions          = { DBInstanceIdentifier = var.rds_instance_id }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
  tags                = var.tags
}
