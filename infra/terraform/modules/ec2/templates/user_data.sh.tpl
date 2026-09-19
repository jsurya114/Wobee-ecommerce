#!/bin/bash
# Woobe backend EC2 bootstrap — infrastructure readiness only.
#
# This script installs Docker + the Compose plugin, enables unattended
# security patching, confirms the SSM Agent is running, and starts a
# self-hosted Valkey container. It deliberately does NOT start the Woobe
# API or Worker containers: no production Dockerfile exists in the
# repository yet, so there is nothing safe to deploy here. Once Dockerfiles
# exist, the actual application deployment is a separate, later step (see
# the accompanying infrastructure report for what's blocking it).
set -euo pipefail
exec > >(tee /var/log/woobe-bootstrap.log) 2>&1

echo "== Woobe EC2 bootstrap starting: $(date -u) =="

# ---- OS packages & unattended security patching ------------------------
dnf -y update

# NOTE: verify the exact "awscli" package name against the live AL2023 repo
# at first real bootstrap — Amazon occasionally renames/relocates packages
# between AL2023 repo snapshots. If this fails, install the official AWS
# CLI v2 bundle instead (curl the zip from awscli.amazonaws.com and run its
# installer) as a fallback.
dnf -y install docker dnf-automatic awscli

sed -i 's/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sed -i 's/^upgrade_type.*/upgrade_type = security/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer

# ---- Docker + the Compose CLI plugin ------------------------------------
systemctl enable --now docker
usermod -aG docker ec2-user || true

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-aarch64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ---- SSM Agent -----------------------------------------------------------
# Amazon Linux 2023 ships the SSM Agent preinstalled and enabled; this just
# makes sure it's actually running so Session Manager access works from
# first boot.
systemctl enable --now amazon-ssm-agent

# ---- Self-hosted Valkey ---------------------------------------------------
# Infra-only: rate-limit counters, guest-order-claim counters, and the
# BullMQ notification queue's own bookkeeping — never the source of truth
# for inventory/pricing/payments/orders, so no durable volume is mounted
# here (see the infra report for the reasoning). Bound to the loopback
# interface only; the security group also has no rule for port 6379 at all.
mkdir -p /opt/woobe/valkey
VALKEY_PASSWORD=$(aws ssm get-parameter \
  --name "${valkey_param_name}" \
  --with-decryption \
  --region "${aws_region}" \
  --query "Parameter.Value" \
  --output text)

cat > /opt/woobe/valkey/docker-compose.yml <<COMPOSE
services:
  valkey:
    image: valkey/valkey:8-alpine
    container_name: woobe-valkey
    restart: unless-stopped
    command: >
      valkey-server
      --requirepass $VALKEY_PASSWORD
      --maxmemory ${valkey_maxmemory_mb}mb
      --maxmemory-policy allkeys-lru
      --appendonly no
    ports:
      - "127.0.0.1:6379:6379"
COMPOSE
chmod 600 /opt/woobe/valkey/docker-compose.yml

cd /opt/woobe/valkey && docker compose up -d

echo "== Woobe EC2 bootstrap complete: $(date -u) =="
echo "== Docker + Compose + self-hosted Valkey are ready."
echo "== API/Worker containers are NOT started — no production Dockerfile exists yet."
