output "identifier" {
  value = aws_db_instance.this.identifier
}

output "endpoint" {
  value = aws_db_instance.this.endpoint
}

output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "master_user_secret_arn" {
  description = "Secrets Manager ARN holding the AWS-managed master password. Never in Terraform state as plaintext."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
