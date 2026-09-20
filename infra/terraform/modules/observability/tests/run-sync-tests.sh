#!/usr/bin/env bash
# End-to-end test of ../files/sync.sh against a REAL Docker daemon, no AWS needed.
#
#   infra/terraform/modules/observability/tests/run-sync-tests.sh
#   SYNC_DOCUMENT_JSON=plan-doc.json ...run-sync-tests.sh   # test the EXACT document Terraform planned
#   KEEP=1 ...run-sync-tests.sh                             # leave the test container running
#
# The script runs inside a privileged docker:dind container so it sees a production-shaped host:
# a real /opt/woobe, real chown to uids 65534/472, host networking, a shared root mount (for the
# node_exporter rslave bind). `aws` is a stub backed by a file. Images are pulled by digest from
# Docker Hub on first run (~600 MB) — the only network need.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
CFG="$REPO/infra/observability"
NAME="woobe-obs-sync-test-$$"
WORK="$(mktemp -d)"
PASS=0; FAIL=0

cleanup() { [ -n "${KEEP:-}" ] || { docker rm -f "$NAME" >/dev/null 2>&1 || true; }; rm -rf "$WORK"; }
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; [ -z "${2:-}" ] || printf '        %s\n' "$2"; }
check() { # description command...   (command run inside the test container via bash)
  desc="$1"; shift
  if out="$(dx "$*" 2>&1)"; then ok "$desc"; else bad "$desc" "$(printf '%s' "$out" | head -c 400)"; fi
}
dx() { docker exec "$NAME" bash -c "$1"; }
# Some assertions depend on asynchronous work (Prometheus's first scrape, a SIGHUP reload): poll, don't race.
check_eventually() { # description command... (retries for ~60s)
  desc="$1"; shift
  if out="$(dx "for _ in \$(seq 1 30); do if $*; then exit 0; fi; sleep 2; done; exit 1" 2>&1)"; then ok "$desc"; else bad "$desc" "$(printf '%s' "$out" | head -c 300)"; fi
}

# ---- render the script exactly as Terraform does (sorted paths, gzip+base64, header lines) -----------
render() { # outfile [exclude-path] [rule-threshold-override]
  python3 - "$CFG" "$1" "${2:-}" "${3:-}" <<'PY'
import sys, os, glob, gzip, base64
cfg, out, exclude, thr = sys.argv[1:5]
files = {"docker-compose.yml": f"{cfg}/docker-compose.prod.yml", "prometheus/prometheus.yml": f"{cfg}/prometheus/prometheus.yml"}
for f in glob.glob(f"{cfg}/prometheus/rules/*.yml"): files["prometheus/rules/" + os.path.basename(f)] = f
for f in glob.glob(f"{cfg}/grafana/provisioning/**/*.yml", recursive=True): files["grafana/provisioning/" + os.path.relpath(f, f"{cfg}/grafana/provisioning")] = f
for f in glob.glob(f"{cfg}/grafana/dashboards/*.json"): files["grafana/dashboards/" + os.path.basename(f)] = f
content = {k: open(v).read() for k, v in files.items()}
content["prometheus/targets/api.yml"] = '- targets:\n    - 127.0.0.1:4000\n'
content["prometheus/targets/worker.yml"] = '- targets:\n    - 127.0.0.1:9102\n'
content["prometheus/targets/node.yml"] = '- targets:\n    - 127.0.0.1:9100\n'
if thr: content["prometheus/rules/woobe-alerts.rules.yml"] = content["prometheus/rules/woobe-alerts.rules.yml"].replace("> 50", f"> {thr}")
if exclude: content.pop(exclude)
calls = "\n".join(f"install_b64 '{p}' '{base64.b64encode(gzip.compress(content[p].encode(), mtime=0)).decode()}'" for p in sorted(content))
script = open(f"{cfg}/../terraform/modules/observability/files/sync.sh").read().replace("@@INSTALL_FILES@@", calls)
open(out, "w").write("AWS_REGION='ap-south-2'\nGRAFANA_PARAM='/woobe-production/grafana/admin-password'\n" + script)
PY
}

render_from_document() { # SYNC_DOCUMENT_JSON: an SSM document (the planned `content`) -> the exact shell script
  python3 - "$SYNC_DOCUMENT_JSON" "$1" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1]))
open(sys.argv[2], "w").write("\n".join(doc["mainSteps"][0]["inputs"]["runCommand"]) + "\n")
PY
}

echo "== starting the test host (docker:dind, privileged) =="
docker run -d --privileged --name "$NAME" -e DOCKER_TLS_CERTDIR= docker:dind >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" docker info >/dev/null 2>&1 && break; sleep 2; done
docker exec "$NAME" docker info >/dev/null 2>&1 || { echo "inner Docker daemon did not start"; exit 2; }
docker exec "$NAME" sh -c 'apk add --no-cache bash openssl curl coreutils jq >/dev/null' 
# A production host's root mount is shared (systemd); make the container's so `/:/host:ro,rslave` is valid.
dx 'mount --make-rshared /'
docker exec "$NAME" sh -c 'mkdir -p /opt/woobe /var/lib/fake-ssm'

# ---- the aws stub: get/put-parameter on files; logs calls, never values ----------------------------
cat >"$WORK/aws" <<'AWS'
#!/bin/bash
echo "aws $*" | sed -E 's#(--value )[^ ]+#\1<redacted>#' >>/var/log/fake-aws.log
[ "$1" = ssm ] || { echo "unexpected: aws $*" >&2; exit 1; }
sub="$2"; shift 2
name=""; value=""
while [ $# -gt 0 ]; do case "$1" in --name) name="$2"; shift 2;; --value) value="$2"; shift 2;; *) shift;; esac; done
f="/var/lib/fake-ssm/$(echo "$name" | tr '/' '_')"
if [ -n "${FAKE_AWS_FAIL:-}" ]; then echo "An error occurred ($FAKE_AWS_FAIL) when calling the operation: not authorized" >&2; exit 254; fi
case "$sub" in
  get-parameter) [ -f "$f" ] || { echo "An error occurred (ParameterNotFound) when calling the GetParameter operation: $name" >&2; exit 254; }; cat "$f"; echo ;;
  put-parameter) [ ! -f "$f" ] || { echo "An error occurred (ParameterAlreadyExists) when calling the PutParameter operation" >&2; exit 254; }
                 case "$value" in file://*) cp "${value#file://}" "$f";; *) printf '%s' "$value" >"$f";; esac ;;
  *) exit 1 ;;
esac
AWS
docker cp "$WORK/aws" "$NAME:/usr/local/bin/aws"; docker exec "$NAME" chmod +x /usr/local/bin/aws

run_sync() { # scriptfile logfile
  docker cp "$1" "$NAME:/root/sync-under-test.sh"
  docker exec "$NAME" bash -c "WAIT_DOCKER_SECONDS=30 bash /root/sync-under-test.sh" >"$2" 2>&1
}
if [ -n "${SYNC_DOCUMENT_JSON:-}" ]; then render_from_document "$WORK/sync1.sh"; echo "== using the planned Terraform document: $SYNC_DOCUMENT_JSON =="; else render "$WORK/sync1.sh"; fi

echo "== T1 first run: install on an empty host =="
if run_sync "$WORK/sync1.sh" "$WORK/run1.log"; then ok "first sync exits 0"; else bad "first sync exits 0" "$(tail -15 "$WORK/run1.log")"; cat "$WORK/run1.log" | tail -30; exit 1; fi
grep -q "created the Grafana admin password parameter" "$WORK/run1.log" && ok "created the Grafana password parameter" || bad "created the Grafana password parameter"
PW="$(dx 'cat /var/lib/fake-ssm/*grafana*')"
[ -n "$PW" ] && ok "password parameter exists in the (fake) parameter store" || bad "password parameter exists"

echo "== T2 ownership and permissions =="
check "prometheus-data is 700 owned by 65534:65534" '[ "$(stat -c "%a %u:%g" /opt/woobe/prometheus-data)" = "700 65534:65534" ]'
check "grafana-data is 700 owned by 472:0"          '[ "$(stat -c "%a %u:%g" /opt/woobe/grafana-data)" = "700 472:0" ]'
check "secrets dir is 700"                          '[ "$(stat -c %a /opt/woobe/observability/secrets)" = 700 ]'
check "password file is 400 owned by 472:0"         '[ "$(stat -c "%a %u:%g" /opt/woobe/observability/secrets/grafana-admin-password)" = "400 472:0" ]'
check "password file holds exactly the parameter value" "[ \"\$(cat /opt/woobe/observability/secrets/grafana-admin-password)\" = '$PW' ]"

echo "== T3 containers =="
for c in woobe-node-exporter woobe-prometheus woobe-grafana; do
  check "$c is healthy" "[ \"\$(docker inspect -f '{{.State.Health.Status}}' $c)\" = healthy ]"
  check "$c image is pinned by digest" "docker inspect -f '{{.Config.Image}}' $c | grep -q '@sha256:'"
  # SecurityOpt is matched loosely: with `pid: host` Docker itself appends `label=disable` (a host-PID container cannot be SELinux-label confined).
  check "$c restart policy unless-stopped, all capabilities dropped, read-only rootfs" \
    "[ \"\$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}} {{.HostConfig.CapDrop}} {{.HostConfig.ReadonlyRootfs}}' $c)\" = 'unless-stopped [ALL] true' ]"
  check "$c has no-new-privileges" "docker inspect -f '{{.HostConfig.SecurityOpt}}' $c | grep -q 'no-new-privileges:true'"
  check "$c does not mount the Docker socket" "! docker inspect -f '{{json .Mounts}}' $c | grep -q docker.sock"
  check "$c is not privileged" "[ \"\$(docker inspect -f '{{.HostConfig.Privileged}}' $c)\" = false ]"
  check "$c has a memory limit" "[ \"\$(docker inspect -f '{{.HostConfig.Memory}}' $c)\" -gt 0 ]"
  check "$c has log rotation" "docker inspect -f '{{.HostConfig.LogConfig.Config}}' $c | grep -q 'max-size:10m'"
done

echo "== T4 network exposure: loopback only =="
for port in 9090 9100 3000; do
  check "port $port is listening on 127.0.0.1" "netstat -ltn | grep -q '127.0.0.1:$port '"
  check "port $port is NOT listening on any other address" "! netstat -ltn | grep -E '(0.0.0.0|:::|\\*):$port ' "
done

echo "== T5 Prometheus =="
check "Prometheus loaded all 15 rules (7 recording + 8 alerting)" '[ "$(curl -s localhost:9090/api/v1/rules | jq "[.data.groups[].rules[]] | length")" = 15 ]'
check_eventually "node target is up (first scrape done)" 'curl -s localhost:9090/api/v1/targets | jq -e ".data.activeTargets[] | select(.labels.job==\"node\" and .health==\"up\")" >/dev/null'
check "prometheus self-target is up" 'curl -s localhost:9090/api/v1/targets | jq -e ".data.activeTargets[] | select(.labels.job==\"prometheus\" and .health==\"up\")" >/dev/null'
check "API target is 127.0.0.1:4000 (down: nothing listens in this test)" 'curl -s localhost:9090/api/v1/targets | jq -e ".data.activeTargets[] | select(.labels.job==\"woobe-api\" and .scrapeUrl==\"http://127.0.0.1:4000/metrics\")" >/dev/null'
check "worker target is 127.0.0.1:9102" 'curl -s localhost:9090/api/v1/targets | jq -e ".data.activeTargets[] | select(.labels.job==\"woobe-worker\" and .scrapeUrl==\"http://127.0.0.1:9102/metrics\")" >/dev/null'
check "retention is 7d / 2GB" "docker inspect -f '{{json .Args}}' woobe-prometheus | grep -q 'retention.time=7d' && docker inspect -f '{{json .Args}}' woobe-prometheus | grep -q 'retention.size=2GB'"
check "WoobeApiDown / WoobeWorkerDown alert rules are loaded" 'curl -s localhost:9090/api/v1/rules | jq -e "[.data.groups[].rules[].name] | (index(\"WoobeApiDown\") != null) and (index(\"WoobeWorkerDown\") != null)" >/dev/null'

echo "== T6 Grafana =="
gf() { echo "curl -s -u admin:'$PW' localhost:3000$1"; }
check "Grafana health ok"                          'curl -s localhost:3000/api/health | grep -q "\"database\": *\"ok\""'
check "admin login with the generated password works" "$(gf /api/datasources) | grep -q woobe-prometheus"
check "the provisioned datasource is healthy"      "$(gf /api/datasources/uid/woobe-prometheus/health) | grep -q '\"status\":\"OK\"'"
check "3 dashboards were auto-provisioned"         "[ \"\$($(gf '/api/search?type=dash-db') | grep -o woobe- | wc -l)\" -ge 3 ]"
check "a wrong password is rejected (401)"         '[ "$(curl -s -o /dev/null -w "%{http_code}" -u admin:wrong localhost:3000/api/datasources)" = 401 ]'
check "anonymous access is rejected (401)"         '[ "$(curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/dashboards/home)" = 401 ]'
check "self-signup is not possible"                '[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "{\"name\":\"x\",\"email\":\"x@x.com\",\"username\":\"x\",\"password\":\"Aa1!aaaaaa\"}" localhost:3000/api/user/signup)" != 200 ]'

echo "== T7 no secret leakage =="
! grep -qF "$PW" "$WORK/run1.log" && ok "password is not in the sync script output" || bad "password is not in the sync script output"
check "password is not in the fake aws call log"           "! grep -qF '$PW' /var/log/fake-aws.log"
check "password is not in any container's environment or args" "! (docker inspect woobe-grafana woobe-prometheus woobe-node-exporter | grep -qF '$PW')"
check "password is not in any container's logs"            "! (docker logs woobe-grafana 2>&1; docker logs woobe-prometheus 2>&1) | grep -qF '$PW'"
check "password is not in the compose file on disk"        "! grep -rqF '$PW' /opt/woobe/observability --include=*.yml --include=*.json"

echo "== T8 idempotent re-run: nothing recreated, password unchanged =="
IDS_BEFORE="$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')"
SECRET_BEFORE="$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')"
if run_sync "$WORK/sync1.sh" "$WORK/run2.log"; then ok "second sync exits 0"; else bad "second sync exits 0" "$(tail -10 "$WORK/run2.log")"; fi
[ "$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')" = "$IDS_BEFORE" ] && ok "no container was recreated" || bad "no container was recreated"
[ "$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')" = "$SECRET_BEFORE" ] && ok "password file unchanged" || bad "password file unchanged"
! grep -qE "updated |created the Grafana|removed " "$WORK/run2.log" && ok "second run reports no changes" || bad "second run reports no changes" "$(grep -E 'updated |created |removed ' "$WORK/run2.log" | head -3)"
[ "$(dx 'grep -c put-parameter /var/log/fake-aws.log')" = 1 ] && ok "the parameter was created exactly once across both runs" || bad "the parameter was created exactly once"

echo "== T9 config change: applied in place (Prometheus SIGHUP), no recreate =="
render "$WORK/sync2.sh" "" 77
if run_sync "$WORK/sync2.sh" "$WORK/run3.log"; then ok "sync with a changed alert rule exits 0"; else bad "sync with a changed alert rule exits 0" "$(tail -10 "$WORK/run3.log")"; fi
grep -q "updated prometheus/rules/woobe-alerts.rules.yml" "$WORK/run3.log" && ok "the changed rule file was updated" || bad "the changed rule file was updated"
grep -q "reloaded Prometheus configuration" "$WORK/run3.log" && ok "Prometheus was reloaded (SIGHUP)" || bad "Prometheus was reloaded"
[ "$(dx 'docker inspect -f "{{.Id}}" woobe-prometheus')" = "$(echo "$IDS_BEFORE" | sed -n 2p)" ] && ok "Prometheus container was not recreated" || bad "Prometheus container was not recreated"
# jq, not grep: Prometheus's Go JSON encoder escapes ">" as \u003e in the raw response.
check_eventually "Prometheus now serves the new threshold (> 77) after the reload" 'curl -s localhost:9090/api/v1/rules | jq -e "[.data.groups[].rules[] | select(.name==\"WoobeNotificationQueueBacklog\") | .query | contains(\"> 77\")] | any" >/dev/null'

echo "== T10 file removed from Git is pruned from the host =="
render "$WORK/sync3.sh" "grafana/dashboards/woobe-infrastructure.json"
run_sync "$WORK/sync3.sh" "$WORK/run4.log" && ok "sync without one dashboard exits 0" || bad "sync without one dashboard exits 0" "$(tail -5 "$WORK/run4.log")"
check "the removed dashboard is gone from disk" '[ ! -e /opt/woobe/observability/grafana/dashboards/woobe-infrastructure.json ]'
check "the other dashboards remain"             '[ -e /opt/woobe/observability/grafana/dashboards/woobe-api-overview.json ] && [ -e /opt/woobe/observability/grafana/dashboards/woobe-worker-notifications.json ]'
run_sync "$WORK/sync1.sh" "$WORK/run5.log" && ok "restoring the full config converges again" || bad "restoring the full config converges again"

echo "== T11 an application deploy does not touch the observability stack =="
dx 'docker pull -q busybox:stable >/dev/null 2>&1; docker run -d --name woobe-api busybox:stable sleep 3600 >/dev/null; docker run -d --name woobe-worker busybox:stable sleep 3600 >/dev/null'
dx 'echo marker > /opt/woobe/prometheus-data/MARKER; echo marker > /opt/woobe/grafana-data/MARKER'
IDS="$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')"
# The destructive commands deploy.sh runs (`docker rm -f woobe-api woobe-worker`, and `docker image prune`),
# with the prune made STRONGER than deploy.sh's (`-af`, no age filter).
dx 'docker rm -f woobe-api woobe-worker >/dev/null; docker image prune -af >/dev/null'
[ "$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')" = "$IDS" ] && ok "observability containers untouched by rm -f + image prune -af" || bad "observability containers untouched"
check "all three still running" '[ "$(docker ps -q --filter name=woobe-node-exporter --filter name=woobe-prometheus --filter name=woobe-grafana | wc -l)" = 3 ]'
check "Prometheus and Grafana data untouched" '[ -e /opt/woobe/prometheus-data/MARKER ] && [ -e /opt/woobe/grafana-data/MARKER ]'
check "observability config untouched" '[ -e /opt/woobe/observability/prometheus/prometheus.yml ]'

echo "== T12 recreation keeps data and the same Grafana password =="
dx 'docker rm -f woobe-grafana woobe-prometheus >/dev/null'
run_sync "$WORK/sync1.sh" "$WORK/run6.log" && ok "sync recreates removed containers" || bad "sync recreates removed containers" "$(tail -8 "$WORK/run6.log")"
check "Grafana data survived recreation" '[ -e /opt/woobe/grafana-data/MARKER ] && [ -s /opt/woobe/grafana-data/grafana.db ]'
check "Prometheus data survived recreation" '[ -e /opt/woobe/prometheus-data/MARKER ]'
check "the SAME password still logs in (not rotated)" "$(gf /api/datasources) | grep -q woobe-prometheus"

echo "== T13 failure mode: parameter store unreachable =="
if docker exec -e FAKE_AWS_FAIL=AccessDeniedException "$NAME" bash -c "WAIT_DOCKER_SECONDS=30 bash /root/sync-under-test.sh" >"$WORK/run7.log" 2>&1; then bad "sync FAILS when the password parameter cannot be read"; else ok "sync FAILS when the password parameter cannot be read"; fi
grep -q "cannot read /woobe-production/grafana/admin-password" "$WORK/run7.log" && ok "the failure names the parameter (not the value)" || bad "the failure names the parameter"
check "the existing password file was not modified by the failed run" "[ \"\$(cat /opt/woobe/observability/secrets/grafana-admin-password)\" = '$PW' ]"

echo
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
