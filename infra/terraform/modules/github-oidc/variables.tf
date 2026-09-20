variable "github_repository" {
  description = <<-EOT
    GitHub repository allowed to assume the role, as owner/name — or, once the
    repository or its owner has ever been renamed, owner@ownerID/name@repoID:
    GitHub then permanently includes the numeric IDs in the OIDC `sub` claim
    (an anti-spoofing measure so a freed-up old name can't be reused to
    inherit trust), and an exact-match trust policy must match that literally.
    Confirm the real value from a failed run's OIDC subject in CloudTrail
    (`aws cloudtrail lookup-events --lookup-attributes
    AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity`) rather
    than assuming the plain owner/name form still applies.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._-]+(@[0-9]+)?/[A-Za-z0-9._-]+(@[0-9]+)?$", var.github_repository))
    error_message = "github_repository must be owner/name or owner@ownerID/name@repoID — no wildcards."
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
