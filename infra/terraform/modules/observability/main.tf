# Production observability: Prometheus + Grafana + Node Exporter on the single EC2.
#
#   Terraform (this module)
#     -> aws_ssm_document  "<prefix>-observability-sync"   (the config + a converge script)
#     -> aws_ssm_association                                (State Manager runs it on the instance)
#          -> files/sync.sh on the host: directories, Grafana password, config files,
#             `docker compose up -d`, reload/restart only what changed, wait for healthy.
#
# WHY NOT user_data (where nginx and Valkey are set up): aws_instance.backend has
# `user_data_replace_on_change = true`, and EC2 caps user_data at 16 KB. Putting the
# Prometheus config, alert rules and three dashboards there would mean EVERY future dashboard
# or alert tweak REPLACES the only production instance — wiping api.env, the Cloudflare Origin
# certificate and Valkey's data. Delivering this stack through SSM changes it in place:
# `aws_instance.backend` and its user_data are not touched by anything in this module.
#
# WHY NOT the application deploy (modules/ssm-deploy): the observability stack must survive,
# and be independent of, API/worker image replacement. deploy.sh only ever removes the
# containers named woobe-api and woobe-worker.
#
# Networking: every listener is loopback-only and no security-group rule is added — this
# module creates NO network resources. Grafana is reached over an SSM port-forward.

data "aws_caller_identity" "current" {}

locals {
  grafana_param_name = "/${var.name_prefix}/grafana/admin-password"
  grafana_param_arn  = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.grafana_param_name}"

  prom_dir = "${var.config_dir}/prometheus"
  graf_dir = "${var.config_dir}/grafana"

  # Config that is identical in every environment, straight from Git.
  static_files = merge(
    {
      "docker-compose.yml"        = "${var.config_dir}/docker-compose.prod.yml"
      "prometheus/prometheus.yml" = "${local.prom_dir}/prometheus.yml"
    },
    { for f in fileset("${local.prom_dir}/rules", "*.yml") : "prometheus/rules/${f}" => "${local.prom_dir}/rules/${f}" },
    { for f in fileset("${local.graf_dir}/provisioning", "**/*.yml") : "grafana/provisioning/${f}" => "${local.graf_dir}/provisioning/${f}" },
    { for f in fileset("${local.graf_dir}/dashboards", "*.json") : "grafana/dashboards/${f}" => "${local.graf_dir}/dashboards/${f}" },
  )

  # The only environment-specific config: where Prometheus finds its scrape targets. All loopback,
  # because Prometheus is host-networked and the API/worker/Node Exporter bind 127.0.0.1.
  target_files = {
    "prometheus/targets/api.yml"    = yamlencode([{ targets = ["127.0.0.1:${var.api_port}"] }])
    "prometheus/targets/worker.yml" = yamlencode([{ targets = ["127.0.0.1:${var.worker_metrics_port}"] }])
    "prometheus/targets/node.yml"   = yamlencode([{ targets = ["127.0.0.1:9100"] }])
  }

  files = merge({ for path, source in local.static_files : path => file(source) }, local.target_files)

  install_calls = join("\n", [for path in sort(keys(local.files)) : "install_b64 '${path}' '${base64gzip(local.files[path])}'"])

  script = replace(file("${path.module}/files/sync.sh"), "@@INSTALL_FILES@@", local.install_calls)

  # Two variable lines are the only place values are interpolated into the script.
  run_command = concat(
    [
      "AWS_REGION='${var.aws_region}'",
      "GRAFANA_PARAM='${local.grafana_param_name}'",
    ],
    split("\n", local.script)
  )

  document_content = jsonencode({
    schemaVersion = "2.2"
    description   = "Converge the Woobe observability stack (Prometheus, Grafana, Node Exporter) on the instance. Idempotent; never touches the API, worker, nginx or Valkey."
    mainSteps = [{
      action = "aws:runShellScript"
      name   = "syncObservability"
      inputs = {
        timeoutSeconds = "1800"
        runCommand     = local.run_command
      }
    }]
  })
}

resource "aws_ssm_document" "sync" {
  name            = "${var.name_prefix}-observability-sync"
  document_type   = "Command"
  document_format = "JSON"
  content         = local.document_content

  tags = var.tags

  lifecycle {
    # SSM documents are capped at 64 KB. Fail at plan time with a clear message, with headroom,
    # instead of at apply time with an API error.
    precondition {
      condition     = length(local.document_content) < 60000
      error_message = "The observability SSM document is ${length(local.document_content)} bytes; SSM's limit is 64 KB. Trim dashboards/rules or move the config to S3."
    }
  }
}

# State Manager association: runs the document on the instance now (as soon as it is a managed
# instance), whenever the document changes, and every sync_schedule to correct drift. Targeted by
# instance ID; if the instance is ever replaced the target updates in place and the stack is
# reinstalled on the new box (the Grafana password parameter persists; Prometheus/Grafana
# DATA lives on the instance's root volume and does not).
resource "aws_ssm_association" "sync" {
  name                = aws_ssm_document.sync.name
  association_name    = "${var.name_prefix}-observability-sync"
  document_version    = aws_ssm_document.sync.latest_version
  schedule_expression = var.sync_schedule
  max_concurrency     = "1"
  max_errors          = "1"
  compliance_severity = "MEDIUM"

  targets {
    key    = "InstanceIds"
    values = [var.instance_id]
  }
}

# The instance role may read and create-once exactly ONE parameter (the Grafana admin password
# the sync script generates on first run). No wildcard, no other parameters, no KMS grant needed
# (the default AWS-managed SSM key is usable through SSM by principals in the account).
resource "aws_iam_role_policy" "grafana_password" {
  name = "${var.name_prefix}-grafana-admin-password"
  role = var.ec2_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GrafanaAdminPasswordGetPut"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = local.grafana_param_arn
      }
    ]
  })
}
