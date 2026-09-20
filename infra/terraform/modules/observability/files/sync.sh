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
STAGE=""
trap 'rm -f "$MANIFEST" "$MANIFEST.prom" "$MANIFEST.ds" "$ERR" "${NEWSECRET:-}"; [ -z "$STAGE" ] || rm -rf "$STAGE"' EXIT

log() { printf '%s observability-sync: %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# Two literal open/close brace characters must never sit adjacent anywhere in this file: it is
# embedded verbatim into the SSM document's runShellScript content, and SSM's own document-parameter
# syntax uses the same double-brace delimiters — a literal docker-inspect Go-template format string
# makes SSM's CreateDocument content validation fail (e.g. InvalidDocumentContent: Parameter "else"
# is not declared). OB/CB build the braces at runtime instead, so this source text never contains
# two open or two close brace characters next to each other.
OB='{'
CB='}'
docker_field() { docker inspect -f "${OB}${OB}$2${CB}${CB}" "$1"; } # container go-template-body(no braces)
HEALTH_FMT="${OB}${OB}if .State.Health${CB}${CB}${OB}${OB}.State.Health.Status${CB}${CB}${OB}${OB}else${CB}${CB}nohealthcheck${OB}${OB}end${CB}${CB}"

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
# Enforced on EVERY run, not only when the content changed: identical content must not hide a drifted mode/owner
# (a world-readable password file is a finding even if nobody wrote to it).
if [ "$(stat -c '%a %u:%g' "$SECRET_FILE")" != "400 472:0" ]; then chown 472:0 "$SECRET_FILE"; chmod 400 "$SECRET_FILE"; log "corrected permissions of the Grafana password file"; fi

# ---- 4. config files (generated by Terraform from infra/observability + module inputs) ------
# TWO PHASES, so a payload that cannot be decoded changes NOTHING on the host:
#   phase 1 (install_b64): decode + validate EVERY file into a private staging directory;
#   phase 2 (apply_staged): only if all of them decoded, move each changed file into place (atomic rename),
#                           leave unchanged files alone (cmp), and re-assert their mode.
find "$OBS" -maxdepth 1 -type d -name '.stage.*' -exec rm -rf {} + 2>/dev/null || true   # left behind by a run that was SIGKILLed
STAGE="$(mktemp -d "$OBS/.stage.XXXXXX")"     # same filesystem as $OBS, so the final mv is an atomic rename
install_b64() { # relative-path base64-of-gzip-content
  mkdir -p "$STAGE/$(dirname "$1")"
  printf '%s' "$2" | base64 -d | gzip -dc >"$STAGE/$1" || die "cannot decode the payload for $1 — no config file on the host was changed"
  [ -s "$STAGE/$1" ] || die "the payload for $1 decoded to an empty file — no config file on the host was changed"
  printf '%s\n' "$1" >>"$MANIFEST"
}

@@INSTALL_FILES@@

# Validate the staged config BEFORE anything is replaced, so a decodable-but-invalid config (broken compose YAML, a
# Prometheus config it would reject) is refused while the previous, working config is still in place on the host.
validate_staged() {
  [ -s "$STAGE/docker-compose.yml" ] || die "the payload contains no docker-compose.yml — nothing was changed"
  docker compose -p "$PROJECT" -f "$STAGE/docker-compose.yml" config -q >"$ERR" 2>&1 \
    || die "the new docker-compose.yml is invalid — nothing was changed: $(head -c 400 "$ERR")"
  # Only when Prometheus already runs (there is something to protect). On a first install the final health wait catches a
  # bad config, and there is no running instance to disturb. promtool runs from Prometheus's OWN pinned image: no network,
  # read-only mount, no capabilities.
  if docker inspect woobe-prometheus >/dev/null 2>&1; then
    prom_image="$(docker_field woobe-prometheus .Config.Image)"
    docker run --rm --network none --user 0 --cap-drop ALL --entrypoint promtool \
      -v "$STAGE/prometheus:/etc/prometheus:ro" "$prom_image" check config /etc/prometheus/prometheus.yml >"$ERR" 2>&1 \
      || die "promtool rejected the new Prometheus configuration — nothing was changed: $(head -c 600 "$ERR")"
  fi
}
validate_staged

apply_staged() {
  while read -r rel; do
    target="$OBS/$rel"
    mkdir -p "$(dirname "$target")"
    if [ -f "$target" ] && cmp -s "$STAGE/$rel" "$target"; then
      chmod 644 "$target"                        # unchanged content: keep it, but re-assert the mode Prometheus/Grafana rely on
      continue
    fi
    chmod 644 "$STAGE/$rel"
    mv -f "$STAGE/$rel" "$target"
    log "updated $rel"
    case "$rel" in
      prometheus/*)                       PROM_CHANGED=1 ;;
      grafana/provisioning/datasources/*) DATASOURCE_CHANGED=1 ;;
      docker-compose.yml)                 COMPOSE_CHANGED=1 ;;
    esac
  done <"$MANIFEST"
}
apply_staged

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
PROM_STARTED_BEFORE="$(docker_field woobe-prometheus .State.StartedAt 2>/dev/null || echo none)"
timeout 900 docker compose -p "$PROJECT" -f docker-compose.yml up -d --remove-orphans --quiet-pull \
  || die "docker compose up failed (image pull blocked? check outbound access to Docker Hub)"

# Config edits are picked up without recreating anything:
#  - Prometheus: rules/targets/prometheus.yml -> SIGHUP reload (file_sd targets also auto-refresh)
#  - Grafana: dashboards auto-reload every 30s; a changed DATASOURCE needs a restart
PROM_STARTED_AFTER="$(docker_field woobe-prometheus .State.StartedAt 2>/dev/null || echo none)"
if [ "$PROM_CHANGED" = 1 ] && [ "$PROM_STARTED_BEFORE" != none ] && [ "$PROM_STARTED_BEFORE" = "$PROM_STARTED_AFTER" ]; then
  # Prometheus was already running and compose left it alone: ask it to reload, then CONFIRM it accepted the new config.
  # (When compose just created/recreated it, it started with the new files: no reload needed.)
  docker kill -s HUP woobe-prometheus >/dev/null
  sleep 2
  reloaded=0
  for _ in 1 2 3 4 5 6 7 8; do
    # Capture first, match without a pipe: under `pipefail`, `wget | grep -q` reports failure when grep exits early and wget is SIGPIPEd.
    prom_metrics="$(docker exec woobe-prometheus wget -qO- http://127.0.0.1:9090/metrics 2>/dev/null || true)"
    if grep -q '^prometheus_config_last_reload_successful 1$' <<<"$prom_metrics"; then reloaded=1; break; fi
    sleep 2
  done
  [ "$reloaded" = 1 ] || die "Prometheus did not accept the new configuration (prometheus_config_last_reload_successful is not 1); it keeps running the previous one"
  log "reloaded Prometheus configuration (SIGHUP, accepted)"
fi
if [ "$DATASOURCE_CHANGED" = 1 ] && [ "$(docker_field woobe-grafana .State.Running 2>/dev/null)" = true ]; then
  docker restart woobe-grafana >/dev/null && log "restarted Grafana to load the changed datasource"
fi

# ---- 6. wait until all three report healthy -----------------------------------------------------
deadline=$(( $(date +%s) + 240 ))
for c in woobe-node-exporter woobe-prometheus woobe-grafana; do
  while :; do
    state="$(docker inspect -f "$HEALTH_FMT" "$c" 2>/dev/null || echo missing)"
    [ "$state" = healthy ] && break
    if [ "$(date +%s)" -gt "$deadline" ]; then
      log "last 20 log lines of $c:"; docker logs --tail 20 "$c" 2>&1 || true
      die "$c is '$state', not healthy"
    fi
    sleep 3
  done
done
log "converged: node-exporter, prometheus and grafana are healthy (compose changed=$COMPOSE_CHANGED prometheus config changed=$PROM_CHANGED datasource changed=$DATASOURCE_CHANGED)"
