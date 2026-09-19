# The deploy is an SSM Run Command DOCUMENT rather than an ad-hoc shell string
# sent by CI. That keeps deploy logic reviewed and versioned in this repo
# (deploy.sh), and lets the GitHub Actions role be granted permission to run
# this one document only — never AWS-RunShellScript (arbitrary commands).
#
# All three parameters are validated by SSM itself (pattern / allowed values)
# before anything runs on the instance, and validated again by the script.

locals {
  registry = split("/", var.ecr_repository_url)[0]

  script = replace(
    replace(
      replace(file("${path.module}/deploy.sh"), "@@REGISTRY@@", local.registry),
      "@@REPOSITORY_URL@@", var.ecr_repository_url
    ),
    "@@AWS_REGION@@", var.aws_region
  )

  # These three lines are the only place SSM parameters are interpolated.
  run_command = concat(
    [
      "IMAGE_TAG='{{ ImageTag }}'",
      "IMAGE_DIGEST='{{ ImageDigest }}'",
      "RUN_MIGRATIONS='{{ RunMigrations }}'",
    ],
    split("\n", local.script)
  )
}

resource "aws_ssm_document" "deploy" {
  name            = "${var.name_prefix}-deploy"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy an exact Woobe API image (by ECR digest): optional migrations, swap the api + worker containers, verify health, roll back on failure. Single-instance, in-place."
    parameters = {
      ImageTag = {
        type           = "String"
        description    = "Full 40-character git commit SHA the image was built from (for the record; the image is pulled by digest)."
        allowedPattern = "^[0-9a-f]{40}$"
      }
      ImageDigest = {
        type           = "String"
        description    = "ECR image digest to deploy, sha256:<64 hex>."
        allowedPattern = "^sha256:[0-9a-f]{64}$"
      }
      RunMigrations = {
        type          = "String"
        description   = "Run prisma migrate deploy before starting. Must be false when redeploying an older image (rollback)."
        allowedValues = ["true", "false"]
        default       = "true"
      }
    }
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "deployWoobeApi"
      inputs = {
        timeoutSeconds = "1800"
        runCommand     = local.run_command
      }
    }]
  })

  tags = var.tags
}

# Where SSM ships the deploy output (send-command --cloud-watch-output-config),
# so a full deploy transcript survives past SSM's 24,000-character inline
# limit. The instance role already may write to /<name_prefix>/*. Retention is
# capped so this cannot grow unbounded.
resource "aws_cloudwatch_log_group" "deploy" {
  name              = "/${var.name_prefix}/deploy"
  retention_in_days = var.log_retention_days

  tags = var.tags
}
