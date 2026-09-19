# Woobe API + worker deploy — a SAFE SINGLE-INSTANCE IN-PLACE deployment with
# health verification and automatic rollback. It is NOT zero-downtime: there is
# one host, one port and no load balancer, so the API is unavailable while the
# old release is stopped and the new one comes up (typically seconds; bounded
# by STOP_TIMEOUT_SECONDS + HEALTH_TIMEOUT_TRIES). It is not highly available
# and does not self-heal a dead host.
#
# Runs ON the EC2 instance, as root, via SSM Run Command (document in main.tf).
# The document prepends three lines before this script:
#   IMAGE_TAG='<40-hex git sha>'  IMAGE_DIGEST='sha256:<64-hex>'  RUN_MIGRATIONS='true|false'
# and Terraform fills in the three placeholder values just below. Amazon Linux
# 2023's /bin/sh is bash, so `pipefail` is available.
#
# ORDER OF OPERATIONS (each phase only starts if the previous one succeeded):
#   0. validate input + pre-flight        — nothing is touched
#   1. pull the new image by digest       — nothing is touched
#   2. database migrations (if requested) — nothing is touched
#   3. CANDIDATE: start the new API on a spare port (API_PORT+100) and verify it
#      while the current release keeps serving — nothing is touched. Catches a
#      bad Docker config, a startup crash, and failing /health, /ready or
#      crash-looping BEFORE the running release is disturbed.
#   4. SWAP: stop the current API + worker gracefully (SIGTERM, bounded), start
#      the new ones on the real port, verify. Any failure -> roll back.
#
# ROLLBACK uses ONLY the image recorded in $STATE_DIR — written exclusively
# after a release passed full verification. A merely pulled image, a container
# that happens to exist, or anything from a failed attempt is never a rollback
# target.
#
# Never prints the env file (only variable NAMES and line NUMBERS). Application
# log excerpts are printed only on failure, with credentials inside URLs masked;
# full logs stay on the instance in /var/log/woobe-deploy/. No `set -x`.
#
# Literal double-curly-brace sequences are avoided on purpose (SSM treats them
# as parameter placeholders, so Docker Go-templates are assembled at runtime by
# tmpl()), and so is `latest`: the image is always pulled by digest.
set -eu
set -o pipefail 2>/dev/null || true

REGISTRY="@@REGISTRY@@"
REPOSITORY_URL="@@REPOSITORY_URL@@"
AWS_REGION="@@AWS_REGION@@"

APP_DIR=/opt/woobe/app
STATE_DIR="$APP_DIR/state"
ENV_FILE="$APP_DIR/api.env"
LOG_DIR=/var/log/woobe-deploy
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CANDIDATE=woobe-api-candidate

HEALTH_TIMEOUT_TRIES=30      # x3s  = 90s for the app to come up
STABILITY_SECONDS=20         # must stay up, un-restarted, this long
STOP_TIMEOUT_SECONDS=30      # SIGTERM grace period before Docker sends SIGKILL
PULL_TIMEOUT_SECONDS=600     # a hung registry must not hang the deploy

# ---- helpers ----------------------------------------------------------------
OB='{'
CB='}'
tmpl() { printf '%s%s%s%s%s' "$OB" "$OB" "$1" "$CB" "$CB"; }
log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
redact() { sed -E 's#(://)[^@/[:space:]]*@#\1***@#g'; }
inspect() { docker inspect -f "$(tmpl "$1")" "$2" 2>/dev/null; }
is_running() { [ -n "$(docker ps --filter "name=^$1\$" --filter status=running -q)" ]; }
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Failure BEFORE the running release is touched (phases 0-3). Says truthfully
# whether a release is still serving.
abort_untouched() {
  echo "DEPLOY FAILED — $1" >&2
  if is_running woobe-api || is_running woobe-worker; then
    echo "The running release was NOT touched; it is still serving." >&2
  else
    echo "Nothing was replaced (no release was running)." >&2
  fi
  exit 1
}

discard_candidate() { docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true; }

# ---- validate input ---------------------------------------------------------
[ "${#IMAGE_TAG}" -eq 40 ] || abort_untouched "IMAGE_TAG must be a 40-character git SHA."
case "$IMAGE_TAG" in *[!0-9a-f]*) abort_untouched "IMAGE_TAG must be lowercase hex." ;; esac
case "$IMAGE_DIGEST" in sha256:*) ;; *) abort_untouched "IMAGE_DIGEST must look like sha256:<64 hex>." ;; esac
DIGEST_HEX="${IMAGE_DIGEST#sha256:}"
[ "${#DIGEST_HEX}" -eq 64 ] || abort_untouched "IMAGE_DIGEST must be sha256 plus 64 hex characters."
case "$DIGEST_HEX" in *[!0-9a-f]*) abort_untouched "IMAGE_DIGEST must be lowercase hex." ;; esac
case "$RUN_MIGRATIONS" in true|false) ;; *) abort_untouched "RUN_MIGRATIONS must be true or false." ;; esac

IMAGE="$REPOSITORY_URL@$IMAGE_DIGEST"

# ---- pre-flight (nothing running is touched) --------------------------------
mkdir -p "$APP_DIR" "$STATE_DIR" "$LOG_DIR"

[ -s "$ENV_FILE" ] || abort_untouched "$ENV_FILE is missing or empty. Create it once over Session Manager (root:root, mode 600, docker --env-file format: KEY=value, no quotes). See docs/deployment.md."
chmod 600 "$ENV_FILE"

MISSING=""
for key in DATABASE_URL REDIS_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET COOKIE_SECRET GOOGLE_CLIENT_ID \
           MEDIA_STORAGE_DRIVER MEDIA_S3_BUCKET MEDIA_PUBLIC_BASE_URL AWS_REGION; do
  grep -Eq "^$key=.+" "$ENV_FILE" || MISSING="$MISSING $key"
done
[ -z "$MISSING" ] || abort_untouched "required variables missing or empty in api.env:$MISSING"

# Media lives in S3 + CloudFront. Uploads written to the container's disk would
# vanish on the next deploy, so refuse to deploy a config that would do that
# (the app itself also refuses to boot with NODE_ENV=production + local media).
grep -Eq '^MEDIA_STORAGE_DRIVER=s3$' "$ENV_FILE" || abort_untouched "MEDIA_STORAGE_DRIVER must be exactly s3 in api.env (production media is S3 + CloudFront, never local disk)."
grep -Eq '^MEDIA_PUBLIC_BASE_URL=https://' "$ENV_FILE" || abort_untouched "MEDIA_PUBLIC_BASE_URL must be an https:// CloudFront URL in api.env."

# docker --env-file rejects a line whose key is not a plain NAME (e.g. "BAD KEY=x"
# or "KEY = x") and aborts `docker run`. Report line NUMBERS only, never content.
BADLINES="$(grep -nEv '^[[:space:]]*(#.*)?$|^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | cut -d: -f1 | tr '\n' ' ' || true)"
[ -z "$BADLINES" ] || abort_untouched "api.env has lines Docker cannot parse (line numbers: $BADLINES). Each line must be NAME=value, a # comment, or blank."

# docker --env-file keeps quotes as part of the value (unlike Node's loader).
QUOTED="$(grep -E "^[A-Za-z_][A-Za-z0-9_]*=[\"']" "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
[ -z "$QUOTED" ] || abort_untouched "values wrapped in quotes in api.env (docker --env-file keeps the quotes): $QUOTED"

API_PORT="$(grep -E '^API_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2 || true)"
API_PORT="${API_PORT:-4000}"
case "$API_PORT" in ''|*[!0-9]*) abort_untouched "API_PORT in api.env must be a number." ;; esac
[ "$API_PORT" -ge 1 ] && [ "$API_PORT" -le 65000 ] || abort_untouched "API_PORT in api.env must be between 1 and 65000."
CANDIDATE_PORT=$((API_PORT + 100))

# ---- verified-good release (the ONLY rollback target) -----------------------
# The state files are written solely after a release passed full verification.
# A running or leftover container is NOT trusted: it may come from an
# interrupted or failed attempt. Anything not shaped like this repository's
# digest reference is ignored.
read_verified() {
  v="$(cat "$STATE_DIR/$1.image" 2>/dev/null || true)"
  case "$v" in
    "$REPOSITORY_URL"@sha256:*) printf '%s' "$v" ;;
    *) printf '' ;;
  esac
}
PREVIOUS_API_IMAGE="$(read_verified api)"
PREVIOUS_WORKER_IMAGE="$(read_verified worker)"
if [ -z "$PREVIOUS_API_IMAGE" ] || [ -z "$PREVIOUS_WORKER_IMAGE" ]; then
  PREVIOUS_API_IMAGE=""
  PREVIOUS_WORKER_IMAGE=""
  if is_running woobe-api || is_running woobe-worker; then
    log "WARNING: containers are running but no verified-good release is recorded; if this deploy fails after the swap there is nothing verified to roll back to."
  fi
fi

log "Deploying tag=$IMAGE_TAG"
log "  new image:                    $IMAGE"
log "  last verified-good API:       ${PREVIOUS_API_IMAGE:-none}"
log "  last verified-good worker:    ${PREVIOUS_WORKER_IMAGE:-none}"
docker ps -a --filter name='^woobe-' 2>&1 | head -6

# ---- 1. pull (by digest) ----------------------------------------------------
log "Pulling image"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null 2>&1 \
  || abort_untouched "could not authenticate to ECR from the instance (instance role needs ECR pull access)."
timeout "$PULL_TIMEOUT_SECONDS" docker pull --quiet "$IMAGE" >/dev/null 2>&1 || abort_untouched "docker pull failed (or timed out after ${PULL_TIMEOUT_SECONDS}s) for $IMAGE"

case "$(uname -m)" in aarch64|arm64) WANT_ARCH=arm64 ;; x86_64) WANT_ARCH=amd64 ;; *) WANT_ARCH=unknown ;; esac
GOT_ARCH="$(inspect .Architecture "$IMAGE" || echo unknown)"
[ "$GOT_ARCH" = "$WANT_ARCH" ] || abort_untouched "image architecture is $GOT_ARCH but this host is $WANT_ARCH."

# ---- 2. migrate -------------------------------------------------------------
# `prisma migrate deploy` applies only the committed, still-pending migrations
# (it never generates, resets, or diffs) and takes a database advisory lock, so
# two runs cannot collide. It runs BEFORE any container is stopped: a failure
# leaves the running API and worker exactly as they were and fails the deploy.
# RUN_MIGRATIONS=false is used for redeploys of an older image: a rollback must
# never migrate. Migrations are forward-only — rolling back the image does NOT
# roll back the schema, so they must stay compatible with the previous release
# (expand/contract; see docs/deployment.md).
if [ "$RUN_MIGRATIONS" = "true" ]; then
  log "Applying pending database migrations"
  MIGRATE_LOG="$LOG_DIR/$STAMP-migrate.log"
  if ! docker run --rm --network host --env-file "$ENV_FILE" "$IMAGE" \
       sh -c 'cd /app/packages/database && node_modules/.bin/prisma migrate deploy' >"$MIGRATE_LOG" 2>&1; then
    echo "----- migration output (last 40 lines; full log: $MIGRATE_LOG) -----" >&2
    tail -n 40 "$MIGRATE_LOG" | redact >&2
    abort_untouched "database migration failed."
  fi
  tail -n 4 "$MIGRATE_LOG" | redact
else
  log "Skipping database migrations (RUN_MIGRATIONS=false)"
fi

# ---- container lifecycle ----------------------------------------------------
# Host networking: self-hosted Valkey listens on 127.0.0.1 only, and the
# security group exposes nothing but 443 from Cloudflare. `--restart
# unless-stopped` restarts a process that crashes (and after a host reboot); it
# does not act on an "unhealthy" HEALTHCHECK — the verification below does.
# None of these functions removes anything: removal is always explicit.
run_api() { # $1=name $2=image [$3=candidate]
  if [ "${3:-}" = candidate ]; then
    docker run -d --name "$1" --network host --env-file "$ENV_FILE" -e "API_PORT=$CANDIDATE_PORT" \
      --log-opt max-size=10m --log-opt max-file=3 "$2" >/dev/null
  else
    docker run -d --name "$1" --restart unless-stopped --network host --env-file "$ENV_FILE" \
      --log-opt max-size=10m --log-opt max-file=3 "$2" >/dev/null
  fi
}

run_worker() { # $1=image
  docker run -d --name woobe-worker --restart unless-stopped --no-healthcheck \
    --network host --env-file "$ENV_FILE" \
    --log-opt max-size=10m --log-opt max-file=3 \
    "$1" node_modules/.bin/tsx src/worker.ts >/dev/null
}

# verify PORT API_CONTAINER [WORKER_CONTAINER]
# Two phases: come up, then stay up. Sets VERIFY_REASON on failure and
# HEALTHY_AT (epoch seconds) when everything first passed.
VERIFY_REASON=""
HEALTHY_AT=0
verify() {
  port="$1"; api="$2"; worker="${3:-}"
  VERIFY_REASON=""
  tries=0
  while [ "$tries" -lt "$HEALTH_TIMEOUT_TRIES" ]; do
    up=true
    is_running "$api" || up=false
    if [ -n "$worker" ] && ! is_running "$worker"; then up=false; fi
    if [ "$up" = true ] && port_open "$port" \
       && curl -fsS -m 3 "http://127.0.0.1:$port/health" >/dev/null 2>&1 \
       && curl -fsS -m 3 "http://127.0.0.1:$port/ready" >/dev/null 2>&1; then
      break
    fi
    tries=$((tries + 1))
    sleep 3
  done
  if [ "$tries" -ge "$HEALTH_TIMEOUT_TRIES" ]; then
    VERIFY_REASON="not healthy within $((HEALTH_TIMEOUT_TRIES * 3))s (need: container(s) running, port $port open, /health and /ready OK)"
    return 1
  fi
  HEALTHY_AT="$(date +%s)"

  log "Up on port $port; watching for $STABILITY_SECONDS s to catch crash loops"
  sleep "$STABILITY_SECONDS"
  set -- "$api"
  if [ -n "$worker" ]; then set -- "$@" "$worker"; fi
  for c in "$@"; do
    if ! is_running "$c"; then VERIFY_REASON="$c stopped during the stability window"; return 1; fi
    restarts="$(inspect .RestartCount "$c" || echo 0)"
    if [ "$restarts" != "0" ]; then VERIFY_REASON="$c restarted $restarts time(s) — crash loop"; return 1; fi
  done
  if [ "$(inspect .State.Health.Status "$api" || echo none)" = "unhealthy" ]; then
    VERIFY_REASON="$api container healthcheck reports unhealthy"
    return 1
  fi
  if ! curl -fsS -m 3 "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
    VERIFY_REASON="/health stopped passing after the stability window"
    return 1
  fi
  if ! curl -fsS -m 3 "http://127.0.0.1:$port/ready" >/dev/null 2>&1; then
    VERIFY_REASON="/ready stopped passing after the stability window"
    return 1
  fi
  return 0
}

diagnose() { # container names...
  echo "----- diagnostics -----"
  docker ps -a --filter name='^woobe-' 2>&1 | head -6
  for c in "$@"; do
    if docker inspect "$c" >/dev/null 2>&1; then
      health="$(inspect .State.Health.Status "$c" | head -n 1 || true)"
      echo "--- $c: state=$(inspect .State.Status "$c") exit=$(inspect .State.ExitCode "$c") restarts=$(inspect .RestartCount "$c") health=${health:-n/a}"
      docker logs "$c" >"$LOG_DIR/$STAMP-$c.log" 2>&1 || true
      echo "--- $c: last 30 log lines (credentials in URLs masked; full log on the instance: $LOG_DIR/$STAMP-$c.log)"
      tail -n 30 "$LOG_DIR/$STAMP-$c.log" | redact
    fi
  done
  echo "-----------------------"
}

# ---- 3. CANDIDATE: verify the new image before touching the running release --
# The new API starts beside the current one on a spare port (host networking
# makes the real port unavailable until the old API is stopped). It runs against
# the real database and Redis but receives no traffic. If Docker cannot start
# it, it crashes, or /health, /ready or the stability window fail, the deploy
# fails here — with the current release never having been disturbed.
# (The worker has no port, so it cannot be tried beside the running one without
# competing for real queue jobs; it is verified in the swap phase instead.)
trap discard_candidate EXIT
discard_candidate
log "Verifying the new image on a candidate API (port $CANDIDATE_PORT); the current release keeps serving"
if ! run_api "$CANDIDATE" "$IMAGE" candidate; then
  abort_untouched "Docker could not start the candidate API container (invalid Docker configuration or image)."
fi
if ! verify "$CANDIDATE_PORT" "$CANDIDATE"; then
  diagnose "$CANDIDATE"
  abort_untouched "the new image failed verification on the candidate API: $VERIFY_REASON"
fi
discard_candidate
log "Candidate verified. Proceeding to replace the running release."

# ---- 4. SWAP ----------------------------------------------------------------
# From here on the running release is being replaced, so nothing may abort the
# script implicitly: errexit is OFF and every step below is checked explicitly,
# so a failure always reaches the rollback path instead of leaving a
# half-deployed host.
set +e

# Graceful stop: SIGTERM first (the API and worker both handle it: the API
# closes its server and exits 0, force-exiting itself after 10 s; the worker
# waits for its in-flight job), then Docker sends SIGKILL only if the container
# is still alive after STOP_TIMEOUT_SECONDS. Bounded, never indefinite.
stop_container() {
  name="$1"
  if ! docker inspect "$name" >/dev/null 2>&1; then
    log "$name: not present"
    return 0
  fi
  began="$(date +%s)"
  docker stop -t "$STOP_TIMEOUT_SECONDS" "$name" >/dev/null 2>&1
  took=$(( $(date +%s) - began ))
  code="$(inspect .State.ExitCode "$name")"
  if is_running "$name"; then
    docker kill "$name" >/dev/null 2>&1
    if is_running "$name"; then
      log "$name: could NOT be stopped"
      return 1
    fi
  fi
  case "$code" in
    0)   log "$name: stopped gracefully (SIGTERM handled, exit 0) in ${took}s" ;;
    137) log "$name: did not exit within ${STOP_TIMEOUT_SECONDS}s of SIGTERM — force-terminated (SIGKILL, exit 137) after ${took}s" ;;
    *)   log "$name: stopped after SIGTERM with exit code $code in ${took}s" ;;
  esac
  docker rm "$name" >/dev/null 2>&1
  return 0
}

# Stops both in parallel so the worst case is one timeout, not two.
stop_release() {
  stop_container woobe-api & api_pid=$!
  stop_container woobe-worker & worker_pid=$!
  wait "$api_pid"; api_rc=$?
  wait "$worker_pid"; worker_rc=$?
  [ "$api_rc" -eq 0 ] && [ "$worker_rc" -eq 0 ]
}

discard_failed() { docker rm -f woobe-api woobe-worker >/dev/null 2>&1; }

# Records a release as verified-good. Called only after full verification.
record_verified() {
  printf '%s\n' "$IMAGE" >"$STATE_DIR/api.image.tmp" && mv "$STATE_DIR/api.image.tmp" "$STATE_DIR/api.image"
  printf '%s\n' "$IMAGE" >"$STATE_DIR/worker.image.tmp" && mv "$STATE_DIR/worker.image.tmp" "$STATE_DIR/worker.image"
  printf '%s tag=%s %s migrations=%s\n' "$STAMP" "$IMAGE_TAG" "$IMAGE_DIGEST" "$RUN_MIGRATIONS" >>"$STATE_DIR/history.log"
}

# Restores the last verified-good release. Returns 0 only if it is verified live again.
rollback() {
  have_image() { docker image inspect "$1" >/dev/null 2>&1 || timeout "$PULL_TIMEOUT_SECONDS" docker pull --quiet "$1" >/dev/null 2>&1; }
  if ! have_image "$PREVIOUS_API_IMAGE" || ! have_image "$PREVIOUS_WORKER_IMAGE"; then
    echo "ERROR: could not obtain the verified-good image(s) for rollback." >&2
    return 1
  fi
  if ! run_api woobe-api "$PREVIOUS_API_IMAGE"; then echo "ERROR: rollback: Docker could not start woobe-api." >&2; return 1; fi
  if ! run_worker "$PREVIOUS_WORKER_IMAGE"; then echo "ERROR: rollback: Docker could not start woobe-worker." >&2; return 1; fi
  if ! verify "$API_PORT" woobe-api woobe-worker; then
    echo "ERROR: rollback verification failed: $VERIFY_REASON" >&2
    diagnose woobe-api woobe-worker
    return 1
  fi
  return 0
}

# Any failure during the swap ends here: diagnose, discard the unverified new
# containers, restore the last verified-good release, and fail the deploy.
fail_swap() { # $1=reason
  echo "ERROR: $1" >&2
  diagnose woobe-api woobe-worker
  discard_failed
  if [ -z "$PREVIOUS_API_IMAGE" ]; then
    echo "DEPLOY FAILED — no previous verified-good release exists to roll back to; the failed containers were removed and the service is DOWN." >&2
    echo "Database migrations already applied by this deploy (if any) were NOT reverted." >&2
    exit 1
  fi
  log "Rolling back to the last verified-good release: $PREVIOUS_API_IMAGE"
  if rollback; then
    echo "DEPLOY FAILED + ROLLBACK ATTEMPTED — rollback SUCCEEDED; the last verified-good release is live again." >&2
  else
    discard_failed
    echo "DEPLOY FAILED + ROLLBACK ATTEMPTED — rollback FAILED; the service is DOWN. Manual intervention required (Session Manager -> docker ps / docker logs)." >&2
  fi
  echo "Database migrations already applied by this deploy (if any) were NOT reverted." >&2
  exit 1
}

SWAP_BEGAN="$(date +%s)"
log "Stopping the current release (SIGTERM, up to ${STOP_TIMEOUT_SECONDS}s each in parallel; SIGKILL only as a last resort)"
stop_release || fail_swap "could not stop the current release"

log "Starting the new release"
run_api woobe-api "$IMAGE" || fail_swap "Docker could not start the new woobe-api container"
run_worker "$IMAGE" || fail_swap "Docker could not start the new woobe-worker container"
verify "$API_PORT" woobe-api woobe-worker || fail_swap "$VERIFY_REASON"

record_verified
# Drop unused images older than 7 days; recent ones stay for a fast rollback.
docker image prune -af --filter "until=168h" >/dev/null 2>&1
log "API and worker running; /health and /ready OK; stable. The API was unavailable for about $((HEALTHY_AT - SWAP_BEGAN))s during the swap (single instance, no load balancer)."
echo "DEPLOY SUCCESS: $IMAGE_TAG ($IMAGE_DIGEST)"
exit 0
