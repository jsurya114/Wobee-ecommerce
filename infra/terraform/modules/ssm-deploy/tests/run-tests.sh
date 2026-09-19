#!/usr/bin/env bash
# Variables such as RC, OLD_API_ID, OLD_WORKER_ID and OLD_HISTORY are read inside
# the eval'd assertion strings passed to expect(), which shellcheck cannot see.
# shellcheck disable=SC2034
# End-to-end tests for ../deploy.sh, run against REAL Docker — no AWS needed.
#
#   infra/terraform/modules/ssm-deploy/tests/run-tests.sh
#   ONLY="S12 S13" ...run-tests.sh      # run selected scenarios (they share state, so
#                                        # later ones may need earlier ones)
#   KEEP_IMAGES=1 ...run-tests.sh       # keep the ~850 MB test image between runs
#
# What runs: a local registry, Postgres 16 and Redis (all on the host network,
# unusual ports), the REAL API image built from apps/api/Dockerfile, small STUB
# images that fail in specific ways, and a harness container standing in for the
# EC2 host (docker CLI + bash + curl, talking to your Docker daemon). A fake
# `aws` answers ECR login; a `docker` shim injects failures. deploy.sh is
# rendered exactly as Terraform renders it, with only the timing constants
# shortened (health 18s, stability 6s, stop timeout 3s) so the suite finishes in
# minutes. Needs Docker; refuses to run if woobe-api / woobe-worker /
# woobe-api-candidate containers already exist (it would delete them).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
DEPLOY_SH="${DEPLOY_SH:-$HERE/../deploy.sh}"   # override to test a mutated copy
WORK="$(mktemp -d "${TMPDIR:-/tmp}/woobe-deploytest.XXXXXX")"
R="127.0.0.1:15000/woobe-production-api"
BASE_IMG="woobe-deploytest-base"
HARNESS_IMG="woobe-deploytest-harness"
API_PORT=14000
PASS=0; FAIL=0; FAILED_NAMES=()

log() { printf '\n== %s\n' "$*"; }
pass() { PASS=$((PASS + 1)); printf '  PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); printf '  FAIL  %s\n' "$1"; }
expect() { # name, then a command run with eval; passes when it exits 0
  local name="$1"; shift
  if eval "$*" >/dev/null 2>&1; then pass "$name"; else fail "$name"; printf '        (condition: %s)\n' "$*"; fi
}
should_run() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }

# ---- safety ----------------------------------------------------------------
for n in woobe-api woobe-worker woobe-api-candidate; do
  if docker inspect "$n" >/dev/null 2>&1; then
    echo "Refusing to run: a container named '$n' already exists and the tests would delete it." >&2
    exit 2
  fi
done
docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 2; }

cleanup() {
  docker rm -f woobe-api woobe-worker woobe-api-candidate dt-registry dt-pg dt-redis >/dev/null 2>&1
  if [ -z "${KEEP_IMAGES:-}" ]; then
    for t in $(docker image ls "$R" --format '{{.Tag}}' 2>/dev/null); do docker rmi -f "$R:$t" >/dev/null 2>&1; done
    docker rmi -f "$BASE_IMG" "$HARNESS_IMG" >/dev/null 2>&1
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# ---- environment ------------------------------------------------------------
log "Workflow status script tests (no Docker)"
if "$REPO/.github/scripts/test-deploy-status.sh" >"$WORK/status.log" 2>&1; then
  pass "deploy-status.sh: gate/result behavior (disabled => SKIPPED, success => DEPLOYED, failures => red)"
else
  fail "deploy-status.sh unit tests"; cat "$WORK/status.log"
fi

log "Building the real API image (cached after the first run)"
docker build -q -f "$REPO/apps/api/Dockerfile" -t "$BASE_IMG" "$REPO" >/dev/null || { echo "image build failed" >&2; exit 2; }

mkdir -p "$WORK/opt/app" "$WORK/bin" "$WORK/ctx" "$WORK/harness"
cat >"$WORK/harness/Dockerfile" <<'EOF'
FROM docker:cli
RUN apk add --no-cache bash curl
EOF
docker build -q -t "$HARNESS_IMG" "$WORK/harness" >/dev/null

# Fake `aws`: only `ecr get-login-password` is used by deploy.sh.
printf '#!/bin/sh\necho fake-ecr-password\n' >"$WORK/bin/aws"
# `docker` shim: injects failures when FAIL_MODE is set, otherwise passes through.
cat >"$WORK/bin/docker" <<'EOF'
#!/bin/sh
if [ -n "${FAIL_MODE:-}" ] && [ "$1" = run ]; then
  case "$FAIL_MODE" in
    candidate-start)
      case "$*" in *"--name woobe-api-candidate"*) echo "docker: simulated failure starting the candidate container" >&2; exit 125 ;; esac ;;
    final-api-start)
      case "$*" in *"--name woobe-api "*)
        if [ ! -e /opt/woobe/.shim-fired ]; then touch /opt/woobe/.shim-fired; echo "docker: simulated failure starting woobe-api" >&2; exit 125; fi ;; esac ;;
  esac
fi
exec /usr/local/bin/docker "$@"
EOF
chmod +x "$WORK/bin/aws" "$WORK/bin/docker"

log "Starting local registry, Postgres and Redis (host network; ports 15000 / 15432 / 16390)"
docker rm -f dt-registry dt-pg dt-redis >/dev/null 2>&1
docker run -d --name dt-registry --network host -e REGISTRY_HTTP_ADDR=0.0.0.0:15000 registry:2 >/dev/null
docker run -d --name dt-pg --network host -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=t postgres:16-alpine -c port=15432 >/dev/null
docker run -d --name dt-redis --network host redis:7-alpine redis-server --port 16390 >/dev/null
for _ in $(seq 1 30); do docker exec dt-pg pg_isready -p 15432 -U t >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 30); do docker run --rm --network host "$HARNESS_IMG" curl -fs -m 2 http://127.0.0.1:15000/v2/ >/dev/null 2>&1 && break; sleep 1; done

# ---- stub images that fail in specific ways ---------------------------------
tag40() { printf "$1%.0s" $(seq 1 40); }
cat >"$WORK/ctx/stub.js" <<'EOF'
const http = require("http");
const mode = process.env.STUB_MODE;
const port = Number(process.env.API_PORT);
http.createServer((q, r) => {
  let code = 200;
  if (mode === "health500" && q.url === "/health") code = 500;
  if (mode === "ready503" && q.url === "/ready") code = 503;
  r.statusCode = code;
  r.end("stub");
}).listen(port);
if (mode === "crash-window") setTimeout(() => process.exit(1), 4000);
if (mode === "crash-final" && port === 14000) setTimeout(() => process.exit(1), 5000);
if (mode === "ignore-term") process.on("SIGTERM", () => {});
EOF
build_stub() { # tag-char, dockerfile-body
  docker build -q -t "$R:$(tag40 "$1")" -f - "$WORK/ctx" >/dev/null <<EOF
FROM $BASE_IMG
$2
EOF
}
log "Building stub images"
docker tag "$BASE_IMG" "$R:$(tag40 1)"                                                      # good1 = the real image
build_stub 2 'LABEL dt.rev=2'                                                                 # good2 = real image, different digest
build_stub 3 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=none\nCMD ["node","-e","console.error(\\"simulated API startup failure\\");process.exit(1)"]'  # api-crash
build_stub 4 $'USER root\nRUN echo \'throw new Error("simulated worker startup failure")\' > /app/apps/api/src/worker.ts\nUSER node'                                                   # worker-boom
build_stub 5 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=health500\nCMD ["node","/stub.js"]'
build_stub 6 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=ready503\nCMD ["node","/stub.js"]'
build_stub 7 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=crash-window\nCMD ["node","/stub.js"]'
build_stub 8 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=crash-final\nCMD ["node","/stub.js"]'
build_stub 9 $'USER root\nCOPY stub.js /stub.js\nUSER node\nENV STUB_MODE=ignore-term\nCMD ["node","/stub.js"]'
for c in 1 2 3 4 5 6 7 8 9; do docker push -q "$R:$(tag40 $c)" >/dev/null; done
digest() { docker inspect --format '{{index .RepoDigests 0}}' "$R:$(tag40 "$1")" | sed 's/.*@//'; }
# bash 3.2 (macOS) has no associative arrays: digests live in D1..D9.
for c in 1 2 3 4 5 6 7 8 9; do eval "D$c=\"\$(digest $c)\""; done
dgst() { eval "printf '%s' \"\$D$1\""; }
ZERO_DIGEST="sha256:$(printf '0%.0s' $(seq 1 64))"

# ---- helpers ------------------------------------------------------------------
write_env() { # optional extra lines are appended verbatim
  cat >"$WORK/opt/app/api.env" <<EOF
DATABASE_URL=postgresql://t:t@127.0.0.1:15432/t?schema=public
REDIS_URL=redis://127.0.0.1:16390
JWT_ACCESS_SECRET=dt-secret-a
JWT_REFRESH_SECRET=dt-secret-b
COOKIE_SECRET=dt-secret-c
GOOGLE_CLIENT_ID=dt.apps.googleusercontent.com
MEDIA_STORAGE_DRIVER=s3
AWS_REGION=ap-south-2
MEDIA_S3_BUCKET=dt-bucket
MEDIA_PUBLIC_BASE_URL=https://dt.cloudfront.net
API_PORT=$API_PORT
$*
EOF
}
deploy() { # image-char migrations(true|false) [digest-override]  -> RC, $WORK/out.txt
  local c="$1" mig="$2" dg="${3:-$(dgst "$1")}"
  { printf "IMAGE_TAG='%s'\nIMAGE_DIGEST='%s'\nRUN_MIGRATIONS='%s'\n" "$(tag40 "$c")" "$dg" "$mig"
    sed -e 's|@@REGISTRY@@|127.0.0.1:15000|' -e "s|@@REPOSITORY_URL@@|$R|" -e 's|@@AWS_REGION@@|ap-south-2|' \
        -e 's/^HEALTH_TIMEOUT_TRIES=[0-9]*/HEALTH_TIMEOUT_TRIES=6/' \
        -e 's/^STABILITY_SECONDS=[0-9]*/STABILITY_SECONDS=6/' \
        -e 's/^STOP_TIMEOUT_SECONDS=[0-9]*/STOP_TIMEOUT_SECONDS=3/' \
        ${DEPLOY_EXTRA_SED:+-e "$DEPLOY_EXTRA_SED"} "$DEPLOY_SH"
  } >"$WORK/run.sh"
  rm -f "$WORK/opt/.shim-fired"
  docker run --rm --network host -e FAIL_MODE="${FAIL_MODE:-}" \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$WORK/opt:/opt/woobe" -v "$WORK/run.sh:/run.sh:ro" \
    -v "$WORK/bin/aws:/usr/local/bin/aws:ro" -v "$WORK/bin/docker:/shim/docker:ro" \
    -e PATH=/shim:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    "$HARNESS_IMG" bash /run.sh >"$WORK/out.txt" 2>&1
  RC=$?
  cat "$WORK/out.txt" >>"$WORK/all-output.txt"
}
out_has() { grep -qF -- "$1" "$WORK/out.txt"; }
cid() { docker inspect -f '{{.Id}}' "$1" 2>/dev/null || echo none; }
cimg() { docker inspect -f '{{.Config.Image}}' "$1" 2>/dev/null || echo none; }
running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }
code() { docker run --rm --network host "$HARNESS_IMG" curl -s -m 4 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2" 2>/dev/null; }
state_api() { cat "$WORK/opt/app/state/api.image" 2>/dev/null || echo none; }
state_worker() { cat "$WORK/opt/app/state/worker.image" 2>/dev/null || echo none; }
history_count() { wc -l <"$WORK/opt/app/state/history.log" 2>/dev/null | tr -d ' ' || echo 0; }
no_containers() { ! docker inspect woobe-api >/dev/null 2>&1 && ! docker inspect woobe-worker >/dev/null 2>&1 && ! docker inspect woobe-api-candidate >/dev/null 2>&1; }
reset_host() { docker rm -f woobe-api woobe-worker woobe-api-candidate >/dev/null 2>&1; rm -rf "$WORK/opt/app/state"; }

# After a failure where the old release must still be intact.
assert_untouched() { # label
  local l="$1"
  expect "$l: script exits non-zero"                       '[ "$RC" -ne 0 ]'
  expect "$l: never reports DEPLOY SUCCESS"                '! out_has "DEPLOY SUCCESS"'
  expect "$l: says DEPLOY FAILED"                          'out_has "DEPLOY FAILED"'
  expect "$l: old API container is the same one (not replaced)"    '[ "$(cid woobe-api)" = "$OLD_API_ID" ] && running woobe-api'
  expect "$l: old worker container is the same one (not replaced)" '[ "$(cid woobe-worker)" = "$OLD_WORKER_ID" ] && running woobe-worker'
  expect "$l: old release still serving /ready"            '[ "$(code $API_PORT /ready)" = 200 ]'
  expect "$l: verified-good state unchanged"               '[ "$(state_api)" = "$R@$D2" ] && [ "$(state_worker)" = "$R@$D2" ] && [ "$(history_count)" = "$OLD_HISTORY" ]'
  expect "$l: candidate container cleaned up"              '! docker inspect woobe-api-candidate'
  expect "$l: output says the running release was not touched" 'out_has "was NOT touched"'
}
assert_rolled_back() { # label
  local l="$1"
  expect "$l: script exits non-zero"                       '[ "$RC" -ne 0 ]'
  expect "$l: never reports DEPLOY SUCCESS"                '! out_has "DEPLOY SUCCESS"'
  expect "$l: reports ROLLBACK ATTEMPTED and SUCCEEDED"    'out_has "DEPLOY FAILED + ROLLBACK ATTEMPTED — rollback SUCCEEDED"'
  expect "$l: API runs the last verified-good image"       '[ "$(cimg woobe-api)" = "$R@$D2" ] && running woobe-api'
  expect "$l: worker runs the last verified-good image"    '[ "$(cimg woobe-worker)" = "$R@$D2" ] && running woobe-worker'
  expect "$l: service is serving again (/ready 200)"       '[ "$(code $API_PORT /ready)" = 200 ]'
  expect "$l: verified-good state unchanged (failed image never recorded)" '[ "$(state_api)" = "$R@$D2" ] && [ "$(history_count)" = "$OLD_HISTORY" ]'
  expect "$l: failed containers/candidate cleaned up"      '! docker inspect woobe-api-candidate'
}

# ======================================================================
if should_run S01; then log "S01 (A,N) first deployment succeeds and reports success"
  write_env; reset_host; deploy 1 true
  expect "exit 0"                                   '[ "$RC" -eq 0 ]'
  expect "reports DEPLOY SUCCESS"                   'out_has "DEPLOY SUCCESS"'
  expect "does not report failure"                  '! out_has "DEPLOY FAILED"'
  expect "API + worker running the deployed digest" '[ "$(cimg woobe-api)" = "$R@$D1" ] && [ "$(cimg woobe-worker)" = "$R@$D1" ] && running woobe-api && running woobe-worker'
  expect "/health and /ready return 200 on the real port" '[ "$(code $API_PORT /health)" = 200 ] && [ "$(code $API_PORT /ready)" = 200 ]'
  expect "candidate container removed"              '! docker inspect woobe-api-candidate'
  expect "verified-good state recorded"             '[ "$(state_api)" = "$R@$D1" ] && [ "$(state_worker)" = "$R@$D1" ] && [ "$(history_count)" = 1 ]'
  expect "migrations ran before the candidate started" 'awk "/Applying pending database migrations/{m=NR} /Verifying the new image on a candidate/{c=NR} END{exit !(m && c && m<c)}" "$WORK/out.txt"'
fi

if should_run S02; then log "S02 (B,O,N) redeployment succeeds; graceful shutdown; migration ordering; bounded downtime"
  deploy 2 true
  expect "exit 0 and DEPLOY SUCCESS"                '[ "$RC" -eq 0 ] && out_has "DEPLOY SUCCESS"'
  expect "API now runs the new digest"              '[ "$(cimg woobe-api)" = "$R@$D2" ] && [ "$(cimg woobe-worker)" = "$R@$D2" ]'
  expect "old API was stopped GRACEFULLY (SIGTERM handled, exit 0)"    'out_has "woobe-api: stopped gracefully (SIGTERM handled, exit 0)"'
  expect "old worker was stopped GRACEFULLY (SIGTERM handled, exit 0)" 'out_has "woobe-worker: stopped gracefully (SIGTERM handled, exit 0)"'
  expect "no force-termination was needed"          '! out_has "force-terminated"'
  expect "candidate verified BEFORE the old release was stopped"       'awk "/Candidate verified/{c=NR} /Stopping the current release/{s=NR} END{exit !(c && s && c<s)}" "$WORK/out.txt"'
  expect "state moved to the new digest only after success" '[ "$(state_api)" = "$R@$D2" ] && [ "$(history_count)" = 2 ]'
  expect "downtime is reported and bounded (<= 30s)" 'n=$(sed -n "s/.*unavailable for about \([0-9]*\)s.*/\1/p" "$WORK/out.txt"); [ -n "$n" ] && [ "$n" -le 30 ]'
  expect "old containers were removed (only the new ones exist)" '[ "$(docker ps -a --filter name=^woobe-api\$ -q | wc -l | tr -d " ")" = 1 ]'
fi

OLD_API_ID="$(cid woobe-api)"; OLD_WORKER_ID="$(cid woobe-worker)"; OLD_HISTORY="$(history_count)"

if should_run S03; then log "S03 (C) API startup failure -> old release untouched"
  deploy 3 false
  assert_untouched "api-crash"
  expect "failure is attributed to the candidate API"  'out_has "failed verification on the candidate API"'
fi
if should_run S04; then log "S04 (H) health check failure -> old release untouched"
  deploy 5 false
  assert_untouched "health-500"
  expect "reason mentions the health timeout"          'out_has "not healthy within"'
fi
if should_run S05; then log "S05 (I) readiness failure -> old release untouched"
  deploy 6 false
  assert_untouched "ready-503"
  expect "reason mentions the health timeout"          'out_has "not healthy within"'
fi
if should_run S06; then log "S06 (J) crash after coming up (inside the stability window) -> old release untouched"
  deploy 7 false
  assert_untouched "crash-in-window"
  expect "crash detected as stopped during the stability window" 'out_has "stopped during the stability window"'
fi
if should_run S07; then log "S07 (F) malformed api.env is caught in pre-flight (line numbers only, never content)"
  write_env $'BAD KEY=has a space'
  deploy 1 false
  assert_untouched "malformed-env"
  expect "reports line numbers, not the offending content"  'out_has "line numbers:" && ! out_has "has a space"'
  write_env
fi
if should_run S08; then log "S08 (F) defense in depth: pre-flight neutered, Docker itself rejects the env file -> old release untouched"
  write_env $'BAD KEY=has a space'
  DEPLOY_EXTRA_SED='s/^\[ -z "\$BADLINES" \] ||.*/true/' deploy 1 false
  assert_untouched "docker-rejects-env"
  expect "explicit handling of the docker run failure"      'out_has "Docker could not start the candidate API container"'
  write_env
fi
if should_run S09; then log "S09 (F) docker run failure for the candidate (injected) -> old release untouched"
  FAIL_MODE=candidate-start deploy 1 false
  assert_untouched "candidate-start-failure"
  expect "explicit handling of the docker run failure"      'out_has "Docker could not start the candidate API container"'
fi
if should_run S10; then log "S10 (G) image pull failure -> old release untouched"
  deploy 1 false "$ZERO_DIGEST"
  assert_untouched "pull-failure"
  expect "reports the pull failure"                         'out_has "docker pull failed"'
fi
if should_run S11; then log "S11 (E) migration failure happens BEFORE anything is replaced -> old release untouched"
  write_env >/dev/null; sed -i.bak 's#127.0.0.1:15432#127.0.0.1:15999#' "$WORK/opt/app/api.env"; rm -f "$WORK/opt/app/api.env.bak"
  deploy 1 true
  assert_untouched "migration-failure"
  expect "reports the migration failure"                    'out_has "database migration failed"'
  expect "no candidate was started and nothing was stopped" '! out_has "Verifying the new image on a candidate" && ! out_has "Stopping the current release"'
  write_env
fi

if should_run S12; then log "S12 (D,K) worker startup failure after the swap -> rollback to the verified-good release"
  deploy 4 false
  assert_rolled_back "worker-boom"
  expect "candidate API passed; the failure was found in the swap phase" 'out_has "Candidate verified" && out_has "Stopping the current release"'
fi
if should_run S13; then log "S13 (J,K) crash loop after the swap (restart policy) -> rollback"
  deploy 8 false
  assert_rolled_back "crash-loop"
  expect "candidate passed on the spare port, crash found on the real port" 'out_has "Candidate verified"'
  expect "detected as a crash / restart"                    'out_has "restarted" || out_has "stopped during the stability window" || out_has "not healthy within"'
fi
if should_run S14; then log "S14 (K) docker run failure AFTER the old release was stopped (injected) -> rollback"
  FAIL_MODE=final-api-start deploy 1 false
  assert_rolled_back "docker-run-failure-after-stop"
  expect "explicit handling, not an errexit abort"          'out_has "Docker could not start the new woobe-api container"'
fi

if should_run S15; then log "S15 (O) graceful stop that does not finish in time is force-killed, bounded"
  deploy 9 false
  expect "ignore-SIGTERM stub deployed and verified"        '[ "$RC" -eq 0 ] && [ "$(cimg woobe-api)" = "$R@$D9" ]'
  deploy 2 false
  expect "exit 0 and DEPLOY SUCCESS"                        '[ "$RC" -eq 0 ] && out_has "DEPLOY SUCCESS"'
  expect "SIGTERM was tried first, then SIGKILL as the last resort" 'out_has "did not exit within 3s of SIGTERM — force-terminated (SIGKILL, exit 137)"'
  expect "the stop was bounded by the timeout (3s..8s)"     'n=$(sed -n "s/.*force-terminated (SIGKILL, exit 137) after \([0-9]*\)s.*/\1/p" "$WORK/out.txt"); [ -n "$n" ] && [ "$n" -ge 3 ] && [ "$n" -le 8 ]'
  expect "the worker still stopped gracefully in the same run" 'out_has "woobe-worker: stopped gracefully"'
  expect "the new release is verified-good again"            '[ "$(state_api)" = "$R@$D2" ]'
fi

if should_run S16; then log "S16 (L) failed FIRST-EVER deployment: candidate fails, nothing left behind"
  reset_host
  deploy 3 false
  expect "exits non-zero, no success"                       '[ "$RC" -ne 0 ] && ! out_has "DEPLOY SUCCESS"'
  expect "says nothing was running to replace"              'out_has "Nothing was replaced (no release was running)"'
  expect "no containers left, no verified-good state recorded" 'no_containers && [ "$(state_api)" = none ]'
fi
if should_run S17; then log "S17 (L) failed first-ever deployment AFTER the swap: no previous verified-good release"
  reset_host
  deploy 8 false
  expect "exits non-zero, no success"                       '[ "$RC" -ne 0 ] && ! out_has "DEPLOY SUCCESS"'
  expect "states there is no verified-good release and the service is down" 'out_has "no previous verified-good release exists to roll back to" && out_has "service is DOWN"'
  expect "does NOT claim a rollback"                        '! out_has "rollback SUCCEEDED"'
  expect "broken containers removed, no verified-good state recorded" 'no_containers && [ "$(state_api)" = none ]'
fi
if should_run S18; then log "S18 (P) a leftover container from a failed attempt is never used as a rollback target"
  reset_host
  docker run -d --name woobe-api --network host --entrypoint sh "$R:$(tag40 3)" -c 'exit 1' >/dev/null 2>&1   # exited leftover, image = api-crash
  sleep 1
  deploy 8 false
  expect "exits non-zero, no success"                       '[ "$RC" -ne 0 ] && ! out_has "DEPLOY SUCCESS"'
  expect "no rollback was attempted (no verified-good image exists)" '! out_has "Rolling back" && out_has "no previous verified-good release exists"'
  expect "the leftover's image was not started"             '! docker ps --filter name=woobe- --format "{{.Image}}" | grep -q "$D3"'
  expect "no verified-good state was invented"              '[ "$(state_api)" = none ]'
fi
if should_run S19; then log "S19 (P) state files that point at a foreign image are ignored"
  reset_host; mkdir -p "$WORK/opt/app/state"
  echo "docker.io/library/alpine@sha256:$(printf 'a%.0s' $(seq 1 64))" >"$WORK/opt/app/state/api.image"
  echo "docker.io/library/alpine@sha256:$(printf 'a%.0s' $(seq 1 64))" >"$WORK/opt/app/state/worker.image"
  deploy 8 false
  expect "exits non-zero, no rollback to a foreign image"   '[ "$RC" -ne 0 ] && ! out_has "Rolling back" && out_has "last verified-good API:       none"'
  reset_host
fi

# ---- global checks ------------------------------------------------------------
log "S99 (7) no secrets or credentials in any script output"
expect "no secret values appear anywhere in the combined output" '! grep -qE "dt-secret|t:t@" "$WORK/all-output.txt"'
expect "no shell tracing (set -x) output"                        '! grep -qE "^\+ " "$WORK/all-output.txt"'

echo
echo "=========================================="
echo "passed: $PASS   failed: $FAIL"
if [ "$FAIL" -ne 0 ]; then printf 'FAILED: %s\n' "${FAILED_NAMES[@]}"; exit 1; fi
