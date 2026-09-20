# Woobe observability sync — Prometheus + Grafana + Node Exporter on the single EC2.
#
# Run BY the SSM document `<name_prefix>-observability-sync` (State Manager association),
# as root, from the SSM agent. NOT user_data and NOT the application deploy — see
# infra/terraform/modules/observability/main.tf for why. Idempotent: safe to run at
# any time and repeatedly; each run converges the host to the version-controlled
# config in Git and does nothing when it is already there.
#
# It NEVER touches: woobe-api, woobe-worker, woobe-nginx, woobe-valkey, /opt/woobe/app,
# /opt/woobe/valkey*, /opt/woobe/nginx, /opt/woobe/certs. It never deletes Prometheus or
# Grafana data, never recreates the Grafana password once it exists, and only prunes
# files inside the config directories it manages.
#
# Header lines prepended by Terraform: AWS_REGION, GRAFANA_PARAM. (Tests also set
# WOOBE_ROOT and WAIT_DOCKER_SECONDS.) Terraform replaces the single marker line in
# section 4 with one `install_b64` call per config file (gzip+base64, so nothing in a
# dashboard or PromQL expression can collide with shell or Terraform syntax).
# Amazon Linux 2023's /bin/sh is bash, so `pipefail` is available.
set -eu
set -o pipefail 2>/dev/null || true

: "${AWS_REGION:?}" "${GRAFANA_PARAM:?}"
ROOT="${WOOBE_ROOT:-/opt/woobe}"
OBS="$ROOT/observability"
PROM_DATA="$ROOT/prometheus-data"
GRAFANA_DATA="$ROOT/grafana-data"
SECRET_FILE="$OBS/secrets/grafana-admin-password"
WAIT_DOCKER_SECONDS="${WAIT_DOCKER_SECONDS:-1200}"
PROJECT="woobe-observability"

PROM_CHANGED=0
DATASOURCE_CHANGED=0
COMPOSE_CHANGED=0
MANIFEST="$(mktemp)"
ERR="$(mktemp)"
trap 'rm -f "$MANIFEST" "$ERR" "${NEWSECRET:-}"' EXIT

log() { printf '%s observability-sync: %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ---- 1. wait for Docker (user_data may still be installing it on a first boot) ---------
waited=0
until docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; do
  [ "$waited" -lt "$WAIT_DOCKER_SECONDS" ] || die "Docker + the Compose plugin are not available after ${WAIT_DOCKER_SECONDS}s (is user_data finished? see /var/log/woobe-bootstrap.log)"
  [ "$waited" -ne 0 ] || log "waiting for Docker and the Compose plugin (first boot: user_data is still running)"
  sleep 10; waited=$((waited + 10))
done

# ---- 2. directories and ownership (never recursive over existing data unless it is mis-owned) --
ensure_dir() { # path mode
  mkdir -p "$1"; chmod "$2" "$1"
}
ensure_owned_data_dir() { # path uid gid
  ensure_dir "$1" 700
  if [ "$(stat -c %u:%g "$1")" != "$2:$3" ]; then
    # Own the directory itself; recurse only if something is already inside it (data
    # written by a container running as another uid). Ownership only — never deletes.
    if [ -n "$(ls -A "$1" 2>/dev/null)" ]; then chown -R "$2:$3" "$1"; else chown "$2:$3" "$1"; fi
    log "fixed ownership of $1 -> $2:$3"
  fi
}
ensure_dir "$OBS" 755
for d in prometheus/rules prometheus/targets grafana/provisioning/datasources grafana/provisioning/dashboards grafana/dashboards; do
  ensure_dir "$OBS/$d" 755
done
ensure_dir "$OBS/secrets" 700
ensure_owned_data_dir "$PROM_DATA" 65534 65534   # prom/prometheus runs as nobody
ensure_owned_data_dir "$GRAFANA_DATA" 472 0      # grafana/grafana runs as uid 472

# ---- 3. Grafana admin password: created ONCE, on the instance, never in Git/Terraform/state ---
# Terraform deliberately does not manage this parameter: an aws_ssm_parameter resource would
# put the real value in Terraform state on the next refresh. The instance role may only
# Get/Put this one parameter name. Put is create-only (no --overwrite), so a rerun or a
# racing run can never rotate the password out from under a logged-in operator.
get_password() {
  aws ssm get-parameter --region "$AWS_REGION" --name "$GRAFANA_PARAM" --with-decryption \
    --query Parameter.Value --output text 2>"$ERR"
}
if PASSWORD="$(get_password)"; then
  :
elif grep -q "ParameterNotFound" "$ERR"; then
  NEWSECRET="$(mktemp)"                                   # mktemp is mode 600
  printf '%s' "$(openssl rand -hex 24)" >"$NEWSECRET"     # 192 random bits, hex: no quoting hazards
  if aws ssm put-parameter --region "$AWS_REGION" --name "$GRAFANA_PARAM" --type SecureString \
       --description "Grafana admin password (generated on the instance; not managed by Terraform)" \
       --value "file://$NEWSECRET" >/dev/null 2>"$ERR"; then
    log "created the Grafana admin password parameter $GRAFANA_PARAM"
  elif grep -q "ParameterAlreadyExists" "$ERR"; then
    log "another run created $GRAFANA_PARAM first; using that value"
  else
    die "could not create $GRAFANA_PARAM: $(head -c 300 "$ERR")"
  fi
  rm -f "$NEWSECRET"
  PASSWORD="$(get_password)" || die "created $GRAFANA_PARAM but cannot read it back: $(head -c 300 "$ERR")"
else
  die "cannot read $GRAFANA_PARAM: $(head -c 300 "$ERR")"
fi
[ -n "$PASSWORD" ] || die "$GRAFANA_PARAM is empty"
TMPSECRET="$SECRET_FILE.tmp"
( umask 077; printf '%s' "$PASSWORD" >"$TMPSECRET" )
unset PASSWORD
chown 472:0 "$TMPSECRET"; chmod 400 "$TMPSECRET"
if [ -f "$SECRET_FILE" ] && cmp -s "$TMPSECRET" "$SECRET_FILE"; then rm -f "$TMPSECRET"; else mv -f "$TMPSECRET" "$SECRET_FILE"; log "wrote the Grafana password file (mode 400, uid 472)"; fi

# ---- 4. config files (generated by Terraform from infra/observability + module inputs) ------
install_b64() { # relative-path base64-of-gzip-content
  target="$OBS/$1"; dir="$(dirname "$target")"; tmp="$target.tmp"
  mkdir -p "$dir"
  printf '%s' "$2" | base64 -d | gzip -dc >"$tmp" || { rm -f "$tmp"; die "cannot decode payload for $1"; }
  [ -s "$tmp" ] || { rm -f "$tmp"; die "payload for $1 decoded to an empty file"; }
  printf '%s\n' "$1" >>"$MANIFEST"
  if [ -f "$target" ] && cmp -s "$tmp" "$target"; then rm -f "$tmp"; return 0; fi
  chmod 644 "$tmp"; mv -f "$tmp" "$target"
  log "updated $1"
  case "$1" in
    prometheus/*)                       PROM_CHANGED=1 ;;
    grafana/provisioning/datasources/*) DATASOURCE_CHANGED=1 ;;
    docker-compose.yml)                 COMPOSE_CHANGED=1 ;;
  esac
}

@@INSTALL_FILES@@

# Remove config files that are no longer in Git (a deleted dashboard/rule must disappear),
# but only inside directories this script owns.
for d in prometheus/rules prometheus/targets grafana/provisioning/datasources grafana/provisioning/dashboards grafana/dashboards; do
  find "$OBS/$d" -type f | while read -r f; do
    rel="${f#"$OBS"/}"
    if ! grep -qxF "$rel" "$MANIFEST"; then rm -f "$f"; log "removed $rel (no longer in Git)"; case "$rel" in prometheus/*) echo 1 >"$MANIFEST.prom";; grafana/provisioning/datasources/*) echo 1 >"$MANIFEST.ds";; esac; fi
  done
done
[ ! -f "$MANIFEST.prom" ] || { PROM_CHANGED=1; rm -f "$MANIFEST.prom"; }
[ ! -f "$MANIFEST.ds" ] || { DATASOURCE_CHANGED=1; rm -f "$MANIFEST.ds"; }

# ---- 5. converge the containers ------------------------------------------------------------------
# `up -d` only recreates a container whose definition or image changed; an unchanged stack is left running.
cd "$OBS"
timeout 900 docker compose -p "$PROJECT" -f docker-compose.yml up -d --remove-orphans --quiet-pull \
  || die "docker compose up failed (image pull blocked? check outbound access to Docker Hub)"

# Config edits are picked up without recreating anything:
#  - Prometheus: rules/targets/prometheus.yml -> SIGHUP reload (file_sd targets also auto-refresh)
#  - Grafana: dashboards auto-reload every 30s; a changed DATASOURCE needs a restart
if [ "$PROM_CHANGED" = 1 ] && docker inspect -f '{{.State.Running}}' woobe-prometheus 2>/dev/null | grep -q true; then
  docker kill -s HUP woobe-prometheus >/dev/null && log "reloaded Prometheus configuration (SIGHUP)"
fi
if [ "$DATASOURCE_CHANGED" = 1 ] && docker inspect -f '{{.State.Running}}' woobe-grafana 2>/dev/null | grep -q true; then
  docker restart woobe-grafana >/dev/null && log "restarted Grafana to load the changed datasource"
fi

# ---- 6. wait until all three report healthy -----------------------------------------------------
deadline=$(( $(date +%s) + 240 ))
for c in woobe-node-exporter woobe-prometheus woobe-grafana; do
  while :; do
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealthcheck{{end}}' "$c" 2>/dev/null || echo missing)"
    [ "$state" = healthy ] && break
    if [ "$(date +%s)" -gt "$deadline" ]; then
      log "last 20 log lines of $c:"; docker logs --tail 20 "$c" 2>&1 || true
      die "$c is '$state', not healthy"
    fi
    sleep 3
  done
done
log "converged: node-exporter, prometheus and grafana are healthy (compose changed=$COMPOSE_CHANGED prometheus config changed=$PROM_CHANGED datasource changed=$DATASOURCE_CHANGED)"
