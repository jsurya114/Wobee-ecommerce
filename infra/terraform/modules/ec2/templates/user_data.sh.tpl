#!/bin/bash
# Woobe backend EC2 bootstrap — infrastructure readiness only.
#
# This script installs Docker + the Compose plugin, enables unattended
# security patching, confirms the SSM Agent is running, starts a self-hosted
# Valkey container, and starts nginx (the HTTPS edge in front of the API). It
# deliberately does NOT start the Woobe API or Worker containers: those are
# deployed by the GitHub Actions pipeline through the SSM document in
# modules/ssm-deploy (see docs/deployment.md). nginx additionally needs a
# Cloudflare Origin CA certificate placed on the host by hand; until it is
# there the nginx container just waits (see the nginx block below).
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

# >>> nginx-edge (executed verbatim by modules/ec2/tests/run-nginx-tests.sh)
# ---- nginx: the HTTPS edge ------------------------------------------------------
# Cloudflare (proxied) --HTTPS--> nginx :80/:443 on this host --HTTP--> the API
# container on 127.0.0.1:${api_port}. nginx is a separate container from the
# application image; it uses host networking so it can reach the API (host
# networking as well) on loopback, and so port ${api_port} never has to be
# published. The config is rendered by Terraform from
# templates/nginx/api.conf.tpl. The certificate and key are NEVER in Git or
# user_data: /opt/woobe/certs/origin.pem + origin.key are created on this host
# by hand (docs/deployment.md, "HTTPS certificate"). Until both exist the
# container waits instead of crash-looping; once they appear it starts on its
# own within a few seconds.
mkdir -p /opt/woobe/nginx/conf.d /opt/woobe/certs
chmod 700 /opt/woobe/certs

cat > /opt/woobe/nginx/conf.d/api.conf <<'NGINX_CONF'
${nginx_conf}
NGINX_CONF

cat > /opt/woobe/nginx/docker-compose.yml <<'NGINX_COMPOSE'
services:
  nginx:
    image: ${nginx_image}
    container_name: woobe-nginx
    restart: unless-stopped
    network_mode: host
    volumes:
      - /opt/woobe/nginx/conf.d:/etc/nginx/conf.d:ro
      - /opt/woobe/certs:/etc/nginx/certs:ro
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        until [ -s /etc/nginx/certs/origin.pem ] && [ -s /etc/nginx/certs/origin.key ]; do
          echo "nginx is waiting for /opt/woobe/certs/origin.pem and origin.key (Cloudflare Origin CA certificate)"
          sleep 5
        done
        nginx -t && exec nginx -g "daemon off;"
NGINX_COMPOSE

cd /opt/woobe/nginx && docker compose up -d
# <<< nginx-edge

echo "== Woobe EC2 bootstrap complete: $(date -u) =="
echo "== Docker + Compose + self-hosted Valkey + nginx are set up."
echo "== nginx serves HTTPS once /opt/woobe/certs/origin.pem and origin.key exist."
echo "== API/Worker containers are deployed by the GitHub Actions pipeline, not here."
