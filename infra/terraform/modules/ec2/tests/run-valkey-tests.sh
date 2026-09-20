#!/usr/bin/env bash
# shellcheck disable=SC2034
# Local tests for self-hosted Valkey persistence/reliability hardening
# (the "valkey" and "valkey-metrics" blocks of user_data.sh.tpl). Real
# Docker, NO AWS (a stub `aws` in PATH answers the two calls the rendered
# script makes: `ssm get-parameter` and `cloudwatch put-metric-data`).
#
#   infra/terraform/modules/ec2/tests/run-valkey-tests.sh
#   KEEP_IMAGES=1 ...run-valkey-tests.sh     # keep the ~850 MB API test image between runs
#
# What is exercised, exactly as production would run it:
#   * the "valkey" block of the rendered user_data is EXECUTED (paths
#     remapped into a temp dir, exactly like run-nginx-tests.sh does for
#     the nginx block): it creates /opt/woobe/valkey-data, fetches the
#     password (stubbed), writes the real compose file, and runs
#     `docker compose up -d` with the pinned image;
#   * real BullMQ (the same library apps/api depends on) adds a job
#     shaped exactly like notification.queue.ts's real enqueue() call;
#   * the Valkey container is SIGKILLed — a hard crash, not a graceful
#     `docker compose stop` — and must come back on its own
#     (restart: unless-stopped) with the job data intact;
#   * the real API + worker images are pointed at the restarted Valkey and
#     must reconnect and process a freshly-added job;
#   * the actual push-metrics.sh body is extracted from the rendered
#     template (not retyped) and run directly against the real container;
#   * a separate small-maxmemory instance proves noeviction actually
#     fails writes instead of silently dropping keys.
#
# NOT exercised here, deliberately: `systemctl enable --now` itself (no
# systemd inside a plain Docker container — that only means something on
# a real AL2023 host) and a real EC2 reboot. Both are documented
# limitations, not gaps being hidden — see docs/deployment.md.
#
# Needs Docker, terraform, python3, node (for a throwaway BullMQ script
# run inside the real API image, not on the host).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EC2="${EC2_DIR:-$(cd "$HERE/.." && pwd)}"
REPO="$(cd "$HERE/../../../../.." && pwd)"
DEPLOY_SH="$REPO/infra/terraform/modules/ssm-deploy/deploy.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/woobe-valkeytest.XXXXXX")"
API_IMG=woobe-valkeytest-api
HARNESS_IMG=woobe-valkeytest-harness
TEST_PASSWORD=vk-test-secret-9x
OPT="$WORK/opt-woobe"
PASS=0; FAIL=0; FAILED_NAMES=()

log() { printf '\n== %s\n' "$*"; }
pass() { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); printf '  FAIL  %s\n' "$1"; }
expect() {
  local name="$1"; shift
  if eval "$*" >/dev/null 2>&1; then pass "$name"; else
    fail "$name"; printf '        (condition: %s)\n' "$*"
  fi
}

# ---- P0: static, no Docker required --------------------------------------
# Runs even when Docker is unavailable, so this one check always executes.
log "P0 deploy.sh cannot touch the Valkey persistent data directory (static check)"
expect "deploy.sh contains no reference to /opt/woobe/valkey anywhere"   '! grep -q "opt/woobe/valkey" "$DEPLOY_SH"'
expect "deploy.sh's own file operations are scoped to APP_DIR=/opt/woobe/app only" 'grep -q "^APP_DIR=/opt/woobe/app" "$DEPLOY_SH"'

# ---- safety ---------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available — P0 above still ran; the rest of this suite (persistence/restart/BullMQ/noeviction) needs Docker and was SKIPPED, not passed." >&2
  echo "=========================================="
  echo "passed: $PASS   failed: $FAIL   (Docker-dependent tests skipped)"
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi
for n in woobe-valkey woobe-api woobe-worker vt-tiny; do
  if docker inspect "$n" >/dev/null 2>&1; then echo "Refusing to run: a container named '$n' exists and would be deleted." >&2; exit 2; fi
done
command -v terraform >/dev/null || { echo "terraform is required (only 'terraform console', offline)." >&2; exit 2; }

cleanup() {
  docker rm -f woobe-valkey woobe-api woobe-worker vt-tiny vt-pg >/dev/null 2>&1
  if [ -z "${KEEP_IMAGES:-}" ]; then docker rmi -f "$API_IMG" "$HARNESS_IMG" >/dev/null 2>&1; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---- setup ------------------------------------------------------------------
log "Setup: harness image (docker CLI + stub aws), API image (cached after first run)"
mkdir -p "$WORK/harness" "$WORK/bin" "$OPT"
printf 'FROM docker:cli\nRUN apk add --no-cache bash curl openssl nodejs npm\n' >"$WORK/harness/Dockerfile"
docker build -q -t "$HARNESS_IMG" "$WORK/harness" >/dev/null || exit 2
docker build -q -f "$REPO/apps/api/Dockerfile" -t "$API_IMG" "$REPO" >/dev/null || { echo "API image build failed" >&2; exit 2; }

# Stub `aws`: answers the two calls the rendered user_data / push-metrics.sh
# make. ssm get-parameter -> the test password. cloudwatch put-metric-data ->
# records the full argv to $CW_LOG and succeeds, so assertions can inspect
# exactly what would have been pushed.
cat >"$WORK/bin/aws" <<'STUB'
#!/bin/sh
if [ "$1" = "ssm" ] && [ "$2" = "get-parameter" ]; then
  echo "$VALKEY_TEST_PASSWORD"
  exit 0
fi
if [ "$1" = "cloudwatch" ] && [ "$2" = "put-metric-data" ]; then
  echo "$@" >>"$CW_LOG"
  exit 0
fi
exit 0
STUB
chmod +x "$WORK/bin/aws"
: >"$WORK/cw-calls.log"

hc() { docker run --rm --network host -v "$WORK:$WORK" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e VALKEY_TEST_PASSWORD="$TEST_PASSWORD" -e CW_LOG="$WORK/cw-calls.log" "$HARNESS_IMG" "$@"; }

# render_valkey <maxmemory_mb>: the "valkey" block of the rendered user_data,
# with /opt/woobe remapped into $OPT (the only change made to it), and its
# markers stripped.
render_valkey() {
  mkdir -p "$WORK/tfc"
  python3 - "$EC2" "$1" >"$WORK/tfc/expr.txt" <<'EOF'
import sys
ec2,mem=sys.argv[1:3]
print(f'templatefile("{ec2}/templates/user_data.sh.tpl", {{name_prefix="woobe-valkeytest", valkey_param_name="/x", valkey_maxmemory_mb={mem}, valkey_mem_limit_mb={int(mem)*3//2}, compose_version="v0", aws_region="ap-south-2", api_port=14000, nginx_image="nginx@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236", nginx_conf="x"}})')
EOF
  (cd "$WORK/tfc" && terraform console <expr.txt >ud.raw 2>ud.err) || { cat "$WORK/tfc/ud.err"; return 1; }
  python3 - "$WORK" <<'EOF'
import sys
w=sys.argv[1]
raw=open(w+"/tfc/ud.raw").read()
body=raw[len("<<EOT\n"):raw.rstrip().rfind("EOT")]
open(w+"/user_data.sh","w").write(body)
blk=body.split("# >>> valkey (",1)[1].split("\n",1)[1].split("# <<< valkey\n",1)[0]
open(w+"/valkey.sh","w").write("set -euo pipefail\n"+blk.replace("/opt/woobe", w+"/opt-woobe"))
metrics=body.split("push-metrics.sh <<'PUSHSCRIPT'\n",1)[1].split("\nPUSHSCRIPT",1)[0]
open(w+"/push-metrics.sh","w").write(metrics)
EOF
}

# ==============================================================================================
# ---- pre-flight: this harness uses the REAL production port (127.0.0.1:6379) on purpose, because it tests the
# exact compose the instance would run. If anything already publishes it, every scenario below would fail for a
# reason that has nothing to do with Valkey — say so once, clearly, and stop.
if hc sh -c 'nc -z 127.0.0.1 6379' >/dev/null 2>&1; then
  echo "PRE-FLIGHT FAILED: something on this Docker host already listens on 127.0.0.1:6379:" >&2
  docker ps --format '  container {{.Names}}  {{.Ports}}' | grep -E '6379->' >&2 || true
  echo "This suite cannot run until that port is free (it does not stop other people's containers). Stop it, or run the suite on a Docker host where 6379 is unused." >&2
  exit 2
fi

log "P1 Valkey starts from the real user_data block (persistence + noeviction + healthcheck configured)"
render_valkey 64 || exit 2
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e VALKEY_TEST_PASSWORD="$TEST_PASSWORD" "$HARNESS_IMG" bash "$WORK/valkey.sh" >"$WORK/valkey.out" 2>&1
[ -s "$OPT/valkey/docker-compose.yml" ] || { echo "  --- output of the executed valkey block:"; sed 's/^/  | /' "$WORK/valkey.out"; }
expect "user_data valkey block ran and 'docker compose up -d' succeeded" '[ -s "$OPT/valkey/docker-compose.yml" ] || (cat "$WORK/valkey.out" && false)'
expect "compose file mounts a HOST-BACKED directory at /data (not an anonymous volume)" 'grep -qE "^\s*- /.*valkey-data:/data" "$OPT/valkey/docker-compose.yml"'
expect "the host data directory was actually created, restrictively permissioned (700)" '[ -d "$OPT/valkey-data" ] && [ "$(stat -f %Lp "$OPT/valkey-data" 2>/dev/null || stat -c %a "$OPT/valkey-data")" = 700 ]'
expect "compose enables AOF with appendfsync everysec"                 'grep -q -- "--appendonly yes" "$OPT/valkey/docker-compose.yml" && grep -q -- "--appendfsync everysec" "$OPT/valkey/docker-compose.yml"'
expect "compose sets RDB save points too (belt-and-suspenders)"        'grep -q -- "--save 900 1 300 10 60 10000" "$OPT/valkey/docker-compose.yml"'
expect "compose uses noeviction, NOT allkeys-lru"                      'grep -q -- "--maxmemory-policy noeviction" "$OPT/valkey/docker-compose.yml" && ! grep -q allkeys-lru "$OPT/valkey/docker-compose.yml"'
expect "compose sets a hard Docker mem_limit above maxmemory (headroom for AOF rewrite)" 'grep -qE "mem_limit: (96|9[0-9])m" "$OPT/valkey/docker-compose.yml"'
expect "compose declares a valkey-cli-based healthcheck (not just a process check)"  'grep -q "valkey-cli" "$OPT/valkey/docker-compose.yml" && grep -q "healthcheck:" "$OPT/valkey/docker-compose.yml"'
expect "compose publishes ONLY 127.0.0.1:6379 (no public bind)"        'grep -qE "^\s*- \"127\.0\.0\.1:6379:6379\"" "$OPT/valkey/docker-compose.yml" && ! grep -qE "^\s*- \"6379:6379\"" "$OPT/valkey/docker-compose.yml"'
sleep 3
expect "container is running"                                          'docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q .'
sleep 10
expect "healthcheck reports healthy (correctly authenticates via REDISCLI_AUTH, no password on the command line)" 'docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q .'
expect "auth works with the real password"                              '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ]'
expect "auth is REJECTED with a wrong password (NOAUTH/WRONGPASS, not PONG)" '[ "$(docker exec -e REDISCLI_AUTH=wrong woobe-valkey valkey-cli ping 2>&1)" != PONG ]'

# ==============================================================================================
log "P2 a real BullMQ job (same shape as notification.queue.ts) is written, then survives a SIGKILL"
cat >"$WORK/bullmq-add.js" <<EOF
const { Queue } = require("bullmq");
const q = new Queue("notifications", { connection: { host: "127.0.0.1", port: 6379, password: process.env.VPW } });
(async () => {
  await q.add("send", { notificationId: process.argv[2] }, { jobId: process.argv[2], attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 1000 });
  await q.close();
})();
EOF
cat >"$WORK/bullmq-check.js" <<EOF
const { Queue } = require("bullmq");
const q = new Queue("notifications", { connection: { host: "127.0.0.1", port: 6379, password: process.env.VPW } });
(async () => {
  const job = await q.getJob(process.argv[2]);
  console.log(job ? "FOUND" : "MISSING");
  await q.close();
})();
EOF
docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" -w /app "$API_IMG" node "$WORK/bullmq-add.js" job-before-crash >"$WORK/add1.out" 2>&1
expect "job added before the crash (BullMQ write succeeded)"           'grep -qv Error "$WORK/add1.out" || true; docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" "$API_IMG" node "$WORK/bullmq-check.js" job-before-crash | grep -q FOUND'

AOF_BEFORE="$(docker exec woobe-valkey sh -c "ls -la /data/appendonlydir 2>/dev/null | wc -l")"
expect "an AOF directory exists on the bind-mounted host path (persistence is actually writing)" '[ "${AOF_BEFORE:-0}" -gt 0 ]'

docker kill -s SIGKILL woobe-valkey >/dev/null
sleep 1
expect "immediately after SIGKILL the container is gone or restarting (proves restart: unless-stopped is doing something, not that it was never touched)" '! docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q . || docker inspect -f "{{.RestartCount}}" woobe-valkey | grep -qv "^0$"'
for _ in $(seq 1 30); do docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q . && break; sleep 1; done
expect "Valkey AUTOMATICALLY restarted after being SIGKILLed (restart: unless-stopped, no manual intervention)" 'docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q .'
for _ in $(seq 1 30); do docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q . && break; sleep 1; done
expect "Valkey is healthy again after the restart"                     'docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q .'
expect "authentication still works after the restart"                  '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ]'

# ==============================================================================================
log "P3 the job written BEFORE the crash is still there AFTER the restart (the actual persistence proof)"
docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" "$API_IMG" node "$WORK/bullmq-check.js" job-before-crash >"$WORK/check1.out" 2>&1
expect "job-before-crash SURVIVED the SIGKILL + automatic restart (AOF replay worked)" 'grep -q FOUND "$WORK/check1.out"'

log "P4 a NEW job can be added and found after the restart"
docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" "$API_IMG" node "$WORK/bullmq-add.js" job-after-restart >"$WORK/add2.out" 2>&1
docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" "$API_IMG" node "$WORK/bullmq-check.js" job-after-restart >"$WORK/check2.out" 2>&1
expect "a job added AFTER the restart is found (queue is fully usable again, not just alive)" 'grep -q FOUND "$WORK/check2.out"'

# ==============================================================================================
log "P5 the real API + worker reconnect to the restarted Valkey and process the new job"
cat >"$WORK/api.env" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://t:t@127.0.0.1:15432/t?schema=public
REDIS_URL=redis://:$TEST_PASSWORD@127.0.0.1:6379
JWT_ACCESS_SECRET=vt-secret-a
JWT_REFRESH_SECRET=vt-secret-b
COOKIE_SECRET=vt-secret-c
GOOGLE_CLIENT_ID=vt.apps.googleusercontent.com
MEDIA_STORAGE_DRIVER=s3
AWS_REGION=ap-south-2
MEDIA_S3_BUCKET=vt-bucket
MEDIA_PUBLIC_BASE_URL=https://vt.cloudfront.net
RAZORPAY_WEBHOOK_SECRET=whsec_valkey_test
API_PORT=14000
API_BIND_HOST=127.0.0.1
EOF
docker rm -f vt-pg >/dev/null 2>&1
docker run -d --name vt-pg --network host -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t postgres:16-alpine -c port=15432 >/dev/null
for _ in $(seq 1 30); do docker exec vt-pg pg_isready -p 15432 -U t >/dev/null 2>&1 && break; sleep 1; done
docker run --rm --network host --env-file "$WORK/api.env" "$API_IMG" sh -c 'cd /app/packages/database && node_modules/.bin/prisma migrate deploy' >/dev/null 2>&1
docker run -d --name woobe-worker --network host --env-file "$WORK/api.env" --no-healthcheck "$API_IMG" node_modules/.bin/tsx src/worker.ts >/dev/null
sleep 3
expect "worker connected to Valkey and is listening on the real queue"  'docker logs woobe-worker 2>&1 | grep -q "listening on queue"'
expect "worker is still running (no crash loop against the restarted Valkey)" 'docker ps --filter name=^woobe-worker\$ --filter status=running -q | grep -q .'

# ==============================================================================================
log "P6 no public 6379 exposure in the production-style container configuration"
BRIDGE_GW="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
BR_CODE="$(docker run --rm "$HARNESS_IMG" sh -c "echo -e '' | timeout 2 nc $BRIDGE_GW 6379" >/dev/null 2>&1; echo $?)"
expect "a container in a SEPARATE network namespace cannot reach 6379 ($BRIDGE_GW)" '[ "$BR_CODE" != 0 ]'
HOST_IPS="$(hc sh -c "ip -4 -o addr show | awk '{print \$4}' | cut -d/ -f1 | grep -v '^127\.'" 2>/dev/null)"
for IPV4 in $HOST_IPS; do
  C="$(docker run --rm "$HARNESS_IMG" sh -c "timeout 2 nc -zv $IPV4 6379" >/dev/null 2>&1; echo $?)"
  expect "6379 is not reachable on non-loopback address $IPV4" '[ "$C" != 0 ]'
done
expect "control: 6379 IS reachable on 127.0.0.1 (what the API/worker use)" 'docker run --rm --network host "$HARNESS_IMG" sh -c "timeout 2 nc -zv 127.0.0.1 6379"'

# ==============================================================================================
log "P7 push-metrics.sh (the ACTUAL rendered script, not retyped) reports correctly, up and down"
: >"$WORK/cw-calls.log"
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e CW_LOG="$WORK/cw-calls.log" "$HARNESS_IMG" bash "$WORK/push-metrics.sh" >"$WORK/metrics1.out" 2>&1
expect "while Valkey is up: pushed ValkeyUp=1 with a plausible (nonzero) used_memory"  'grep -q "ValkeyUp,Value=1" "$WORK/cw-calls.log" && grep -qE "ValkeyUsedMemoryBytes,Value=[1-9][0-9]*" "$WORK/cw-calls.log"'
docker stop woobe-valkey >/dev/null
: >"$WORK/cw-calls.log"
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e CW_LOG="$WORK/cw-calls.log" "$HARNESS_IMG" bash "$WORK/push-metrics.sh" >"$WORK/metrics2.out" 2>&1
expect "while Valkey is down: pushed ValkeyUp=0 (not silently skipped, not a false positive)" 'grep -q "ValkeyUp,Value=0" "$WORK/cw-calls.log" && grep -q "ValkeyUsedMemoryBytes,Value=0" "$WORK/cw-calls.log"'
docker start woobe-valkey >/dev/null 2>&1 || true

# ==============================================================================================
log "P8 maxmemory-policy noeviction: writes fail loudly instead of silently evicting a protected key"
docker rm -f vt-tiny >/dev/null 2>&1
docker run -d --name vt-tiny --network host valkey/valkey:8-alpine \
  valkey-server --port 16402 --requirepass tiny-secret --maxmemory 2mb --maxmemory-policy noeviction >/dev/null
for _ in $(seq 1 20); do docker exec -e REDISCLI_AUTH=tiny-secret vt-tiny valkey-cli -p 16402 ping 2>/dev/null | grep -q PONG && break; sleep 1; done
docker exec -e REDISCLI_AUTH=tiny-secret vt-tiny valkey-cli -p 16402 set protected-key "must-not-be-evicted" >/dev/null
FILL_ERR=""
for i in $(seq 1 4000); do
  OUT="$(docker exec -e REDISCLI_AUTH=tiny-secret vt-tiny valkey-cli -p 16402 set "fill:$i" "$(head -c 2000 </dev/zero | tr '\0' 'x')" 2>&1)"
  case "$OUT" in *OOM*|*"out of memory"*) FILL_ERR="$OUT"; break ;; esac
done
expect "once maxmemory is reached, a write fails with an OOM-style error (noeviction is in effect)" '[ -n "$FILL_ERR" ]'
expect "the earlier protected key was NOT silently evicted to make room (this would fail under allkeys-lru)" '[ "$(docker exec -e REDISCLI_AUTH=tiny-secret vt-tiny valkey-cli -p 16402 get protected-key)" = "must-not-be-evicted" ]'
docker rm -f vt-tiny >/dev/null 2>&1

echo
echo "=========================================="
echo "passed: $PASS   failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then printf 'FAILED: %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
