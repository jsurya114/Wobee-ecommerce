#!/usr/bin/env bash
# Local observability stack helper. Usage:  scripts/observability-local.sh up | down | reset | password
# No credentials are stored in Git: the Grafana admin password is generated once into
# infra/observability/.local-secrets/ (gitignored, mode 600) and printed only by `password`.
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET=.local-secrets/grafana-admin-password
COMPOSE=(docker compose -f docker-compose.local.yml)

ensure_secret() {
  mkdir -p .local-secrets && chmod 700 .local-secrets
  if [ ! -s "$SECRET" ]; then
    (umask 077; openssl rand -hex 16 >"$SECRET")
  fi
  # The container's grafana user (uid 472) must be able to read the bind-mounted file.
  chmod 644 "$SECRET"
}

case "${1:-}" in
  up)       ensure_secret; "${COMPOSE[@]}" up -d
            echo "Prometheus: http://localhost:9090   Grafana: http://localhost:3000 (user: admin; password: scripts/observability-local.sh password)" ;;
  down)     "${COMPOSE[@]}" down ;;
  reset)    "${COMPOSE[@]}" down -v ;;   # also deletes the local Prometheus/Grafana data volumes
  password) cat "$SECRET" ;;
  *) echo "usage: $0 up|down|reset|password" >&2; exit 2 ;;
esac
