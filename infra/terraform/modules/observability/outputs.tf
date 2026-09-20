output "document_name" {
  description = "SSM document that installs/converges the observability stack."
  value       = aws_ssm_document.sync.name
}

output "association_id" {
  value = aws_ssm_association.sync.association_id
}

output "grafana_password_parameter" {
  description = "Name (not value) of the SSM SecureString holding the Grafana admin password. Created by the sync script on first run, not by Terraform."
  value       = local.grafana_param_name
}
