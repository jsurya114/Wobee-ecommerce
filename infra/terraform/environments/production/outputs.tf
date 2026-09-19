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

output "media_public_base_url" {
  description = "HTTPS CloudFront origin for media — set as MEDIA_PUBLIC_BASE_URL in the API's api.env."
  value       = module.cloudfront_media.public_base_url
}

output "media_cloudfront_distribution_id" {
  value = module.cloudfront_media.distribution_id
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

output "github_actions_role_arn" {
  description = "Role the GitHub Actions deploy workflow assumes via OIDC (role-to-assume)."
  value       = module.github_oidc.role_arn
}

output "github_oidc_trusted_subject" {
  description = "The exact OIDC sub claim the role trusts."
  value       = module.github_oidc.trusted_subject
}

output "ecr_api_repository_url" {
  description = "Private ECR repository the API/worker image is pushed to."
  value       = module.ecr.repository_url
}

output "ssm_deploy_document_name" {
  description = "SSM Run Command document that performs the on-instance deploy."
  value       = module.ssm_deploy.document_name
}

output "cloudflare_dns_record" {
  description = "The DNS record to create in Cloudflare by hand (nothing here changes Cloudflare). It MUST be proxied: the security group only admits Cloudflare's ranges."
  value = {
    type    = "A"
    name    = var.api_domain
    content = module.ec2.public_ip
    proxied = true
    ssl_tls = "Full (strict), with a Cloudflare Origin CA certificate for ${var.api_domain}"
  }
}
