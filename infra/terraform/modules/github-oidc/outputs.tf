output "role_arn" {
  description = "Role ARN the GitHub workflow assumes (role-to-assume)."
  value       = aws_iam_role.deploy.arn
}

output "role_name" {
  value = aws_iam_role.deploy.name
}

output "oidc_provider_arn" {
  value = local.provider_arn
}

output "trusted_subject" {
  description = "The exact OIDC `sub` claim the trust policy accepts."
  value       = local.subject
}
