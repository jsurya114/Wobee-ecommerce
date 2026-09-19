output "document_name" {
  value = aws_ssm_document.deploy.name
}

output "document_arn" {
  value = aws_ssm_document.deploy.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.deploy.name
}
