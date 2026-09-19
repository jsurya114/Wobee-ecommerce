output "vpc_id" {
  value = module.networking.vpc_id
}

output "ec2_instance_id" {
  value = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "Elastic IP — the stable address to point the Cloudflare DNS record at."
  value       = module.ec2.public_ip
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "rds_port" {
  value = module.rds.port
}

output "rds_master_user_secret_arn" {
  description = "Secrets Manager ARN holding the AWS-managed RDS master credential."
  value       = module.rds.master_user_secret_arn
}

output "s3_media_bucket_name" {
  value = module.s3.bucket_id
}

output "s3_media_bucket_arn" {
  value = module.s3.bucket_arn
}

output "valkey_password_parameter_name" {
  description = "SSM parameter name holding the self-hosted Valkey password (SecureString — value not exposed here)."
  value       = aws_ssm_parameter.valkey_password.name
}

output "sns_alert_topic_arn" {
  value = module.monitoring.sns_topic_arn
}
