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
#   * the Valkey PROCESS is SIGKILLed from the host PID namespace (see crash_valkey) — a hard crash, not a graceful
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
ROOT_VARS="$REPO/infra/terraform/environments/production/variables.tf"
# The scenarios below run against the PRODUCTION values, read from Terraform rather than retyped:
# maxmemory from the root variable's default, the Docker ceiling from main.tf's own formula (x3/2),
# and the digest-pinned image from the module variable.
PROD_MAXMEM_MB="$(sed -n '/variable "valkey_maxmemory_mb"/,/^}/p' "$ROOT_VARS" | sed -n 's/^ *default *= *\([0-9][0-9]*\).*/\1/p')"
PROD_LIMIT_MB=$((PROD_MAXMEM_MB * 3 / 2))
VALKEY_IMAGE="$(sed -n '/variable "valkey_image"/,/^}/p' "$EC2/variables.tf" | sed -n 's/^ *default *= *"\(.*\)"/\1/p')"
[ -n "$PROD_MAXMEM_MB" ] && [ -n "$VALKEY_IMAGE" ] || { echo "could not read production Valkey values from Terraform" >&2; exit 2; }
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
  docker network rm valkey_default >/dev/null 2>&1
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
  python3 - "$EC2" "$1" "${2:-$VALKEY_IMAGE}" >"$WORK/tfc/expr.txt" <<'EOF'
import sys
ec2,mem,img=sys.argv[1:4]
print(f'templatefile("{ec2}/templates/user_data.sh.tpl", {{name_prefix="woobe-valkeytest", valkey_param_name="/x", valkey_maxmemory_mb={mem}, valkey_mem_limit_mb={int(mem)*3//2}, valkey_image="{img}", compose_version="v0", aws_region="ap-south-2", api_port=14000, nginx_image="nginx@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236", nginx_conf="x"}})')
EOF
  (cd "$WORK/tfc" && terraform console <expr.txt >ud.raw 2>ud.err) || { cat "$WORK/tfc/ud.err"; return 1; }
  python3 - "$WORK" <<'EOF'
import sys
w=sys.argv[1]
raw=open(w+"/tfc/ud.raw").read()
body=raw[len("<<EOT\n"):raw.rstrip().rfind("EOT")]
open(w+"/user_data.sh","w").write(body)
blk=body.split("# >>> valkey (",1)[1].split("\n",1)[1].split("# <<< valkey\n",1)[0]
open(w+"/valkey.raw.sh","w").write(blk)   # exactly as Terraform renders it, paths NOT remapped (for exact-path assertions)
open(w+"/valkey.sh","w").write("set -euo pipefail\n"+blk.replace("/opt/woobe", w+"/opt-woobe"))
metrics=body.split("push-metrics.sh <<'PUSHSCRIPT'\n",1)[1].split("\nPUSHSCRIPT",1)[0]
open(w+"/push-metrics.sh","w").write(metrics.replace("/opt/woobe", w+"/opt-woobe"))   # same single remap as the other blocks
EOF
}


# ---- helpers used by the extended scenarios ------------------------------------------------------
# A REAL crash. NOTE: `docker kill` is treated by Docker as a MANUAL stop, so the restart policy is deliberately NOT applied
# to it (verified experimentally: exited, RestartCount 0). What a crash / OOM-kill looks like to Docker is the container's main
# process dying without Docker having been asked to stop it, so kill THAT process, from the host PID namespace.
crash_valkey() {
  local pid; pid="$(docker inspect -f '{{.State.Pid}}' woobe-valkey)"
  [ -n "$pid" ] && [ "$pid" != 0 ] || return 1
  # --entrypoint sh: the harness image's own entrypoint is the `docker` CLI, which would turn `kill -9 PID` into `docker kill -9`.
  docker run --rm --privileged --pid=host --entrypoint sh "$HARNESS_IMG" -c "kill -9 $pid"
}
# Crash, then WAIT until Docker's restart policy has demonstrably restarted it, and record the evidence IMMEDIATELY
# (Docker resets RestartCount once a container has stayed up a while, so it must be read right away).
crash_and_wait() {
  RC_BEFORE="$(restart_count)"; START_BEFORE="$(docker inspect -f '{{.State.StartedAt}}' woobe-valkey)"
  crash_valkey || return 1
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.StartedAt}}' woobe-valkey)" != "$START_BEFORE" ] && docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q . && break
    sleep 1
  done
  RC_AFTER="$(restart_count)"; START_AFTER="$(docker inspect -f '{{.State.StartedAt}}' woobe-valkey)"
}
restart_count() { docker inspect -f '{{.RestartCount}}' woobe-valkey; }
vcli() { docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli --no-auth-warning "$@"; }
wait_healthy() { for _ in $(seq 1 90); do docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q . && return 0; sleep 1; done; return 1; }
node_run() { docker run --rm --network host -e VPW="$TEST_PASSWORD" -v "$WORK:$WORK" "$API_IMG" node "$@"; }
compose_valkey() { docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" -w "$OPT/valkey" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e VALKEY_TEST_PASSWORD="$TEST_PASSWORD" "$HARNESS_IMG" docker compose "$@"; }
# The EFFECTIVE configuration of the RUNNING server (CONFIG GET), not a grep of the compose file. Never prints requirepass.
config_of() { vcli CONFIG GET "$1" | sed -n 2p; }

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
render_valkey "$PROD_MAXMEM_MB" "$VALKEY_IMAGE" || exit 2
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK:$WORK" -e PATH="$WORK/bin:/usr/local/bin:/usr/bin:/bin" -e VALKEY_TEST_PASSWORD="$TEST_PASSWORD" "$HARNESS_IMG" bash "$WORK/valkey.sh" >"$WORK/valkey.out" 2>&1
[ -s "$OPT/valkey/docker-compose.yml" ] || { echo "  --- output of the executed valkey block:"; sed 's/^/  | /' "$WORK/valkey.out"; }
expect "user_data valkey block ran and 'docker compose up -d' succeeded" '[ -s "$OPT/valkey/docker-compose.yml" ] || (cat "$WORK/valkey.out" && false)'
expect "compose file mounts a HOST-BACKED directory at /data (not an anonymous volume)" 'grep -qE "^\s*- /.*valkey-data:/data" "$OPT/valkey/docker-compose.yml"'
expect "the host data directory was actually created, restrictively permissioned (700)" '[ -d "$OPT/valkey-data" ] && [ "$(stat -f %Lp "$OPT/valkey-data" 2>/dev/null || stat -c %a "$OPT/valkey-data")" = 700 ]'
expect "compose enables AOF with appendfsync everysec"                 'grep -q -- "--appendonly yes" "$OPT/valkey/docker-compose.yml" && grep -q -- "--appendfsync everysec" "$OPT/valkey/docker-compose.yml"'
expect "compose sets RDB save points too (belt-and-suspenders)"        'grep -q -- "--save 900 1 300 10 60 10000" "$OPT/valkey/docker-compose.yml"'
expect "compose uses noeviction, NOT allkeys-lru"                      'grep -q -- "--maxmemory-policy noeviction" "$OPT/valkey/docker-compose.yml" && ! grep -q allkeys-lru "$OPT/valkey/docker-compose.yml"'
expect "compose sets the hard Docker mem_limit (${PROD_LIMIT_MB} MB) above maxmemory (${PROD_MAXMEM_MB} MB): headroom for AOF rewrite" 'grep -qE "mem_limit: ${PROD_LIMIT_MB}m" "$OPT/valkey/docker-compose.yml" && [ "$PROD_LIMIT_MB" -gt "$PROD_MAXMEM_MB" ]'
expect "compose declares a valkey-cli-based healthcheck (not just a process check)"  'grep -q "valkey-cli" "$OPT/valkey/docker-compose.yml" && grep -q "healthcheck:" "$OPT/valkey/docker-compose.yml"'
expect "compose publishes ONLY 127.0.0.1:6379 (no public bind)"        'grep -qE "^\s*- \"127\.0\.0\.1:6379:6379\"" "$OPT/valkey/docker-compose.yml" && ! grep -qE "^\s*- \"6379:6379\"" "$OPT/valkey/docker-compose.yml"'
sleep 3
expect "container is running"                                          'docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q .'
sleep 10
expect "healthcheck reports healthy (correctly authenticates via REDISCLI_AUTH, no password on the command line)" 'docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q .'
expect "auth works with the real password"                              '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ]'
expect "auth is REJECTED with a wrong password (NOAUTH/WRONGPASS, not PONG)" '[ "$(docker exec -e REDISCLI_AUTH=wrong woobe-valkey valkey-cli ping 2>&1)" != PONG ]'

log "P1b the EFFECTIVE production configuration of the RUNNING server (CONFIG GET / docker inspect — not a grep of the compose file)"
MAXMEM_BYTES=$((PROD_MAXMEM_MB * 1024 * 1024))
assert_effective_config() { # label
  expect "$1: maxmemory is ${PROD_MAXMEM_MB} MB ($MAXMEM_BYTES bytes)"      '[ "$(config_of maxmemory)" = "$MAXMEM_BYTES" ]'
  expect "$1: maxmemory-policy is noeviction"                                '[ "$(config_of maxmemory-policy)" = noeviction ]'
  expect "$1: AOF is enabled (appendonly yes)"                               '[ "$(config_of appendonly)" = yes ]'
  expect "$1: appendfsync is everysec"                                       '[ "$(config_of appendfsync)" = everysec ]'
  expect "$1: the persistence directory is /data"                            '[ "$(config_of dir)" = /data ]'
  expect "$1: RDB snapshot points are configured too"                        '[ "$(config_of save)" = "900 1 300 10 60 10000" ]'
  expect "$1: a password is required (requirepass is set)"                   'vcli CONFIG GET requirepass | sed -n 2p | grep -q .'
  expect "$1: an UNAUTHENTICATED client is refused (NOAUTH)"                 'docker exec woobe-valkey sh -c "unset REDISCLI_AUTH; valkey-cli ping" 2>&1 | grep -q NOAUTH'
}
assert_effective_config "fresh start"
expect "the Docker memory ceiling is ${PROD_LIMIT_MB} MB"                    '[ "$(docker inspect -f "{{.HostConfig.Memory}}" woobe-valkey)" = "$((PROD_LIMIT_MB * 1024 * 1024))" ]'
expect "the ceiling is above maxmemory (headroom for AOF rewrite / fork)"    '[ "$((PROD_LIMIT_MB * 1024 * 1024))" -gt "$MAXMEM_BYTES" ]'
expect "the Terraform-rendered block bind-mounts EXACTLY /opt/woobe/valkey-data:/data" 'grep -qE "^\s*- /opt/woobe/valkey-data:/data\s*$" "$WORK/valkey.raw.sh"'
expect "the running container's mount is a host bind of the data dir onto /data, read-write" '[ "$(docker inspect -f "{{range .Mounts}}{{.Type}}:{{.Source}}:{{.Destination}}:{{.RW}}{{end}}" woobe-valkey)" = "bind:$OPT/valkey-data:/data:true" ]'
expect "the image is pinned by DIGEST (no floating tag) in the compose file"  'grep -qE "^\s*image: valkey/valkey@sha256:[0-9a-f]{64}\s*$" "$OPT/valkey/docker-compose.yml"'
expect "the running container uses exactly the Terraform-pinned image"        '[ "$(docker inspect -f "{{.Config.Image}}" woobe-valkey)" = "$VALKEY_IMAGE" ]'
expect "restart policy is unless-stopped"                                     '[ "$(docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" woobe-valkey)" = unless-stopped ]'
expect "the ONLY published port is 127.0.0.1:6379 (no 0.0.0.0, no ::)"       '[ "$(docker inspect -f "{{json .NetworkSettings.Ports}}" woobe-valkey)" = "{\"6379/tcp\":[{\"HostIp\":\"127.0.0.1\",\"HostPort\":\"6379\"}]}" ]'
expect "docker port reports 127.0.0.1:6379 and nothing wildcard"              'docker port woobe-valkey | grep -q "127.0.0.1:6379" && ! docker port woobe-valkey | grep -qE "(0\.0\.0\.0|\[::\]|:::)"'


# ==============================================================================================
log "P2 a real BullMQ job (same shape as notification.queue.ts) is written, then survives a SIGKILL"
cat >"$WORK/bullmq-add.js" <<EOF
const { Queue } = require("/app/apps/api/node_modules/bullmq");
const q = new Queue("notifications", { connection: { host: "127.0.0.1", port: 6379, password: process.env.VPW } });
(async () => {
  await q.add("send", { notificationId: process.argv[2] }, { jobId: process.argv[2], attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 1000 });
  await q.close();
})();
EOF
cat >"$WORK/bullmq-check.js" <<EOF
const { Queue } = require("/app/apps/api/node_modules/bullmq");
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

crash_and_wait
for _ in $(seq 1 30); do docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q . && break; sleep 1; done
expect "Valkey AUTOMATICALLY restarted after its process was SIGKILLed (restart: unless-stopped, no manual intervention)" 'docker ps --filter name=^woobe-valkey\$ --filter status=running -q | grep -q .'
expect "and it really was the restart policy: RestartCount went up ($RC_BEFORE -> $RC_AFTER) and StartedAt changed" '[ "$RC_AFTER" -gt "$RC_BEFORE" ] && [ "$START_AFTER" != "$START_BEFORE" ]'
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
log "P4b BullMQ queue state: waiting / delayed / active / completed / failed all survive four kinds of restart"
cat >"$WORK/bullmq-states.js" <<'EOF'
const { Queue, Worker } = require("/app/apps/api/node_modules/bullmq");
const connection = { host: "127.0.0.1", port: 6379, password: process.env.VPW };
const NAME = "vstates";
const EXPECT = { "st-completed": ["completed"], "st-failed": ["failed"], "st-delayed": ["delayed"], "st-waiting": ["waiting"], "st-active": ["active", "waiting"] };
// An ACTIVE job may legitimately be found back in `waiting` if a worker's stalled-job check ran; what must never
// happen is that it is LOST.
async function verify(q) {
  let bad = 0;
  for (const [id, ok] of Object.entries(EXPECT)) {
    const job = await q.getJob(id);
    const state = job ? await job.getState() : "MISSING";
    const marker = job && job.data && job.data.marker;
    const good = ok.includes(state) && marker === "m-" + id;
    if (id === "st-completed" && !(job && job.returnvalue === "ok")) bad++;
    if (id === "st-failed" && !(job && job.failedReason === "boom")) bad++;
    console.log(`${good ? "ok " : "BAD"} ${id} state=${state} payload=${marker === "m-" + id ? "intact" : "WRONG"}`);
    if (!good) bad++;
  }
  console.log(bad === 0 ? "ALL-STATES-OK" : "STATES-LOST-OR-CORRUPT");
  process.exit(bad === 0 ? 0 : 1);
}
async function seed(q) {
  const worker = new Worker(NAME, async (job) => {
    if (job.name === "fail") throw new Error("boom");
    if (job.name === "hold") await new Promise(() => {}); // never resolves: this job stays ACTIVE
    return "ok";
  }, { connection, concurrency: 1, lockDuration: 600000 });
  const until = async (fn) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error("timeout"); };
  const add = (name, id, opts = {}) => q.add(name, { marker: "m-" + id }, { jobId: id, attempts: 1, removeOnComplete: false, removeOnFail: false, ...opts });
  await add("ok", "st-completed");   await until(async () => (await q.getJobCounts()).completed === 1);
  await add("fail", "st-failed");    await until(async () => (await q.getJobCounts()).failed === 1);
  await add("hold", "st-active");    await until(async () => (await q.getJobCounts()).active === 1);
  await add("ok", "st-waiting");     // concurrency is 1 and the slot is held: this one stays waiting
  await add("ok", "st-delayed", { delay: 3600000 });
  console.log("SEEDED", JSON.stringify(await q.getJobCounts()));
  process.exit(0); // worker deliberately not closed: the hold job stays ACTIVE with its lock
}
(async () => { const q = new Queue(NAME, { connection }); await (process.argv[2] === "seed" ? seed(q) : verify(q)); })().catch((e) => { console.error("ERR", e.message); process.exit(2); });
EOF
node_run "$WORK/bullmq-states.js" seed >"$WORK/states-seed.out" 2>&1
expect "seeded: one job in EACH of completed / failed / active / waiting / delayed" 'grep -q SEEDED "$WORK/states-seed.out" && grep -q "\"completed\":1" "$WORK/states-seed.out" && grep -q "\"failed\":1" "$WORK/states-seed.out" && grep -q "\"active\":1" "$WORK/states-seed.out" && grep -q "\"waiting\":1" "$WORK/states-seed.out" && grep -q "\"delayed\":1" "$WORK/states-seed.out"'
check_states() { # label
  node_run "$WORK/bullmq-states.js" verify >"$WORK/states-verify.out" 2>&1
  expect "$1: all five queue states and every job payload are intact" 'grep -q ALL-STATES-OK "$WORK/states-verify.out"'
  if ! grep -q ALL-STATES-OK "$WORK/states-verify.out"; then sed 's/^/        | /' "$WORK/states-verify.out"; fi
}
check_states "before any restart (baseline)"
sleep 3   # appendfsync everysec: let the last write reach disk before a hard kill (the documented durability window is <= 1s)

# -- 1. hard crash --
crash_and_wait
expect "process crash: the process REALLY died and the restart policy restarted it (RestartCount $RC_BEFORE -> $RC_AFTER, new StartedAt)" '[ "$RC_AFTER" -gt "$RC_BEFORE" ] && [ "$START_AFTER" != "$START_BEFORE" ]'
wait_healthy; expect "process crash: restarted by the restart policy, healthy again, authentication works" '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ]'
check_states "after SIGKILL + automatic restart"
assert_effective_config "after SIGKILL"

# -- 2. graceful restart --
docker restart woobe-valkey >/dev/null; wait_healthy
expect "docker restart: healthy again, authentication works" '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ]'
check_states "after a graceful docker restart"
assert_effective_config "after docker restart"

# -- 3. container RECREATION (same compose, new container ID) --
OLD_ID="$(docker inspect -f '{{.Id}}' woobe-valkey)"
compose_valkey up -d --force-recreate >"$WORK/recreate.out" 2>&1; wait_healthy
expect "compose --force-recreate produced a NEW container (a genuine recreation, not a no-op)" '[ "$(docker inspect -f "{{.Id}}" woobe-valkey)" != "$OLD_ID" ]'
expect "after recreation: authentication works and the healthcheck is healthy" '[ "$(docker exec -e REDISCLI_AUTH="$TEST_PASSWORD" woobe-valkey valkey-cli ping)" = PONG ] && docker ps --filter name=^woobe-valkey\$ --filter health=healthy -q | grep -q .'
check_states "after container RECREATION"
assert_effective_config "after recreation"

# -- 4. container REMOVED entirely, then brought back by the same compose file --
docker rm -f woobe-valkey >/dev/null
expect "the container is really gone (only the host directory holds the data now)" '! docker ps -a --filter name=^woobe-valkey\$ -q | grep -q .'
compose_valkey up -d >"$WORK/recreate2.out" 2>&1; wait_healthy
check_states "after rm -f + compose up (data survived on the host bind mount alone)"
assert_effective_config "after rm -f + up"
expect "the host data directory still exists, is mode 700, and holds the AOF" '[ "$(stat -f %Lp "$OPT/valkey-data" 2>/dev/null || stat -c %a "$OPT/valkey-data")" = 700 ] && ls "$OPT/valkey-data" | grep -q appendonlydir'

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
