# Woobe backend EC2 — a single Graviton (Arm64) instance, no Auto Scaling
# Group in Phase 1. SSH is never configured (no key_name, no port-22
# security-group rule); all access is via SSM Session Manager through the
# instance profile attached below.
#
# AMI: Amazon Linux 2023, arm64. Chosen deliberately over alternatives
# because it (a) ships the SSM Agent preinstalled and enabled, so Session
# Manager access works with zero extra bootstrap, (b) has first-class,
# AWS-maintained Graviton support and a predictable patch/support cadence
# tied to AWS's own release cycle, and (c) provides `dnf-automatic` for
# straightforward unattended security patching. Resolved via the
# AWS-published SSM parameter rather than a hardcoded AMI ID, so this
# always launches the current AL2023 arm64 AMI for the deployed region.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_instance" "backend" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [var.ec2_sg_id]
  iam_instance_profile   = var.iam_instance_profile_name

  # No key_name — SSH is not configured. See module header comment.

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 required
    http_put_response_hop_limit = 2          # containers add a network hop; IMDSv2's default hop limit of 1 would break in-container metadata calls
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tpl", {
    valkey_param_name   = var.valkey_param_name
    valkey_maxmemory_mb = var.valkey_maxmemory_mb
    compose_version     = var.compose_version
    aws_region          = var.aws_region
  })
  # A user_data change (e.g. bumping the Compose version) replaces the
  # instance rather than silently no-op'ing on an already-running box —
  # there is no ASG here to roll a replacement non-disruptively, so this
  # is a deliberate, visible-in-plan tradeoff for a Phase 1 single instance.
  user_data_replace_on_change = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-backend" })
}

# A dedicated Elastic IP, associated directly to the instance — this is
# the stable origin address Cloudflare's DNS record points at. Because
# Phase 1 has no Auto Scaling Group, there is no automatic
# instance-replacement event to react to; if this instance is ever
# manually replaced, re-associating this same EIP to the new instance is
# a manual step (documented in the report). The lifecycle-hook/Lambda
# EIP-reassociation pattern discussed for a future self-healing ASG only
# becomes necessary once an ASG actually exists.
resource "aws_eip" "backend" {
  instance = aws_instance.backend.id
  domain   = "vpc"

  tags = merge(var.tags, { Name = "${var.name_prefix}-backend-eip" })
}
