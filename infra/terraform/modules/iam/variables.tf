variable "name_prefix" {
  type = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 media bucket the EC2 instance role may read/write."
  type        = string
}

variable "valkey_param_arn" {
  description = "ARN of the SSM SecureString parameter holding the self-hosted Valkey password."
  type        = string
}

variable "rds_secret_arn" {
  description = "ARN of the AWS-managed Secrets Manager secret holding the RDS master credential."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
