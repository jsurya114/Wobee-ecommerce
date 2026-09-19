# GitHub Actions -> AWS via OIDC. No long-lived AWS keys exist anywhere: the
# workflow exchanges GitHub's short-lived OIDC token for temporary STS
# credentials by assuming the role below.
#
# The trust policy is pinned to ONE repository on ONE branch. There is no
# wildcard in the `sub` condition — pull requests, forks, other branches and
# tags cannot assume this role.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# An account can hold only one OIDC provider per issuer URL. When another
# stack already created it, pass its ARN in `existing_provider_arn` and this
# module reuses it instead of failing on a duplicate.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.existing_provider_arn == "" ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list is intentionally omitted: AWS validates GitHub's issuer
  # against its own trusted CA store and ignores thumbprints for it.

  tags = var.tags
}

locals {
  provider_arn = var.existing_provider_arn != "" ? var.existing_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  account_id   = data.aws_caller_identity.current.account_id
  region       = data.aws_region.current.name

  oidc_host = "token.actions.githubusercontent.com"
  subject   = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"
}

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  description          = "Assumed by GitHub Actions (${var.github_repository}, branch ${var.github_branch}) to push images to ECR and trigger the SSM deploy."
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "GitHubActionsOidc"
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_host}:aud" = "sts.amazonaws.com"
          "${local.oidc_host}:sub" = local.subject
        }
      }
    }]
  })

  tags = merge(var.tags, { Name = var.role_name })
}

resource "aws_iam_role_policy" "deploy" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # GetAuthorizationToken has no resource-level scoping in IAM.
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPushToApiRepository"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = var.ecr_repository_arn
      },
      {
        # The role can run exactly one Run Command document — the Woobe deploy
        # document — not arbitrary shell (AWS-RunShellScript is not granted).
        Sid      = "RunOnlyTheDeployDocument"
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = var.ssm_document_arn
      },
      {
        # ...and only against this project's instances, matched by tag so this
        # stays valid across an instance replacement.
        Sid      = "TargetOnlyWoobeInstances"
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringEquals = { for k, v in var.instance_tags : "ssm:resourceTag/${k}" => v }
        }
      },
      {
        # Read-only polling of command results; these APIs are not
        # resource-scopable.
        Sid      = "ReadCommandResults"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
    ]
  })
}
