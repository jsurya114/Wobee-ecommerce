variable "name_prefix" {
  type = string
}

variable "ecr_repository_url" {
  description = "Full ECR repository URL (<account>.dkr.ecr.<region>.amazonaws.com/<name>) the deploy pulls from."
  type        = string
}

variable "aws_region" {
  type = string
}

variable "log_retention_days" {
  description = "Retention for the deploy output log group."
  type        = number
  default     = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
