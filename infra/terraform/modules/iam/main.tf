# EC2 instance role — this is the application-runtime identity, deliberately
# separate from whatever human/SSO role runs Terraform itself
# (WoobeTerraformAdmin). It can manage its own S3 media objects, publish
# CloudWatch metrics/logs under this project's namespace, read the two
# runtime secrets it needs at boot/runtime, and be managed via SSM Session
# Manager. Nothing here is AdministratorAccess or any other broad policy.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_iam_role" "ec2" {
  name = "${var.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, { Name = "${var.name_prefix}-ec2-role" })
}

# SSM Session Manager access — this is what replaces SSH entirely. No
# inbound port 22 rule exists anywhere in the security module; this
# managed policy is the only thing required for shell access via
# `aws ssm start-session`.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "s3_media_access" {
  name = "${var.name_prefix}-s3-media-access"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "MediaObjectAccess"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Sid      = "MediaBucketList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.s3_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "cloudwatch_agent" {
  name = "${var.name_prefix}-cloudwatch-agent"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "MetricsPublish"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
        Condition = {
          StringEquals = { "cloudwatch:namespace" = var.name_prefix }
        }
      },
      {
        Sid    = "LogDelivery"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/${var.name_prefix}/*"
      }
    ]
  })
}

# Read-only access to exactly the two secrets this instance needs — the
# self-hosted Valkey password (SSM Parameter Store) and, once the app is
# actually deployed, the RDS master credential (Secrets Manager, AWS-managed
# — Terraform never sees the plaintext value; see the rds module).
resource "aws_iam_role_policy" "runtime_secrets_read" {
  name = "${var.name_prefix}-runtime-secrets-read"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ValkeyPasswordRead"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = var.valkey_param_arn
      },
      {
        Sid      = "RdsCredentialRead"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.rds_secret_arn
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2.name

  tags = merge(var.tags, { Name = "${var.name_prefix}-ec2-profile" })
}
