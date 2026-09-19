variable "github_repository" {
  description = "GitHub repository allowed to assume the role, as owner/name."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must be exactly owner/name — no wildcards."
  }
}

variable "github_branch" {
  description = "The single branch whose workflow runs may assume the role."
  type        = string
  default     = "main"

  validation {
    condition     = can(regex("^[A-Za-z0-9._/-]+$", var.github_branch))
    error_message = "github_branch must be a literal branch name — no wildcards."
  }
}

variable "role_name" {
  type    = string
  default = "woobe-github-actions-deploy"
}

variable "existing_provider_arn" {
  description = "ARN of an already-existing token.actions.githubusercontent.com OIDC provider to reuse. Leave empty to create it."
  type        = string
  default     = ""
}

variable "ecr_repository_arn" {
  description = "ECR repository the role may push images to."
  type        = string
}

variable "ssm_document_arn" {
  description = "ARN of the SSM Run Command document the role may run."
  type        = string
}

variable "instance_tags" {
  description = "Tags an EC2 instance must carry for the role to run the deploy document on it."
  type        = map(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
