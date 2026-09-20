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
# One line per container: name, full ID, StartedAt, RestartCount. Comparing these (not just IDs) catches a plain
# `docker restart`, which keeps the ID but changes StartedAt / RestartCount.
snap() { dx "docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.RestartCount}}' woobe-node-exporter woobe-prometheus woobe-grafana"; }
snap_of() { snap | grep -- "$1"; }
# A hash of every managed config file (secrets and staging excluded): "did the host's config change at all?"
tree_hash() { dx "cd /opt/woobe/observability && find . -type f -not -path './secrets/*' -not -path './.stage.*' | sort | xargs sha256sum | sha256sum | cut -c1-16"; }
stage_dirs() { dx "ls -d /opt/woobe/observability/.stage.* 2>/dev/null | wc -l"; }
# Some assertions depend on asynchronous work (Prometheus's first scrape, a SIGHUP reload): poll, don't race.
check_eventually() { # description command... (retries for ~60s)
  desc="$1"; shift
  if out="$(dx "for _ in \$(seq 1 30); do if $*; then exit 0; fi; sleep 2; done; exit 1" 2>&1)"; then ok "$desc"; else bad "$desc" "$(printf '%s' "$out" | head -c 300)"; fi
}

# ---- render the script exactly as Terraform does (sorted paths, gzip+base64, header lines) -----------
render() { # outfile [exclude-path] [rule-threshold-override] [mutation]
  python3 - "$CFG" "$1" "${2:-}" "${3:-}" "${4:-}" <<'PY'
import sys, os, glob, gzip, base64
cfg, out, exclude, thr = sys.argv[1:5]
mutate = sys.argv[5] if len(sys.argv) > 5 else ""
import json, re
doc = os.environ.get("SYNC_DOCUMENT_JSON")
doc_lines = None
if doc:
    # The planned Terraform document is the SINGLE rendering authority: every mutated variant is derived from ITS bytes
    # (Terraform's yamlencode quoting, its exact script text), so a mutation differs from the baseline in exactly the
    # intended file and nothing else.
    doc_lines = json.load(open(doc))["mainSteps"][0]["inputs"]["runCommand"]
    content = {}
    for l in doc_lines:
        m = re.match(r"install_b64 '([^']+)' '([^']+)'$", l)
        if m: content[m.group(1)] = gzip.decompress(base64.b64decode(m.group(2))).decode()
else:
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
if mutate in ("dashboard-title", "corrupt-payload"):   # a dashboard-only change (corrupt-payload carries one too: it must NOT be applied)
    content["grafana/dashboards/woobe-api-overview.json"] = content["grafana/dashboards/woobe-api-overview.json"].replace('"title": "Woobe API Overview"', '"title": "Woobe API Overview (edited)"', 1)
elif mutate == "datasource":      # a datasource change: Grafana must restart to load it
    content["grafana/provisioning/datasources/prometheus.yml"] = content["grafana/provisioning/datasources/prometheus.yml"].replace("timeInterval: 15s", "timeInterval: 30s", 1)
elif mutate == "compose-grafana": # a compose change to ONE service: only that container may be recreated
    content["docker-compose.yml"] = content["docker-compose.yml"].replace("GF_LOG_MODE: console", "GF_LOG_MODE: console\n      GF_LOG_LEVEL: warn", 1)
elif mutate == "bad-compose":     # YAML that compose will refuse
    content["docker-compose.yml"] = "services: [this is: not: valid\n"
elif mutate == "bad-prom-config": # decodable, but Prometheus would refuse it
    content["prometheus/prometheus.yml"] = "scrape_configs: [\n  - job_name: broken\n"
elif mutate == "targets-only":    # a scrape-target change (file_sd)
    content["prometheus/targets/api.yml"] = content["prometheus/targets/api.yml"].replace("127.0.0.1:4000", "127.0.0.1:4001")
def enc(p): return f"install_b64 '{p}' '{base64.b64encode(gzip.compress(content[p].encode(), mtime=0)).decode()}'"
def corrupt(line): return line.replace("install_b64 'prometheus/rules/woobe-alerts.rules.yml' '", "install_b64 'prometheus/rules/woobe-alerts.rules.yml' '@@@not-base64@@@", 1)
if doc_lines is not None:
    out_lines = []
    for l in doc_lines:
        m = re.match(r"install_b64 '([^']+)' '", l)
        if not m: out_lines.append(l); continue
        if m.group(1) not in content: continue          # an excluded file
        e = enc(m.group(1))
        out_lines.append(corrupt(e) if mutate == "corrupt-payload" else e)
    open(out, "w").write("\n".join(out_lines) + "\n")
    sys.exit(0)
calls = "\n".join(enc(p) for p in sorted(content))
if mutate == "corrupt-payload": calls = corrupt(calls)
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
check "a wrong password is rejected (401)"         '[ "$(curl -s -o /dev/null -w "%{http_code}" -u admin:wrong localhost:3000/api/datasources)" = 401 ]' # gitleaks:allow — "wrong" is a literal negative-test password, not a real credential
check "anonymous access is rejected (401)"         '[ "$(curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/dashboards/home)" = 401 ]'
check "self-signup is not possible"                '[ "$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "{\"name\":\"x\",\"email\":\"x@x.com\",\"username\":\"x\",\"password\":\"Aa1!aaaaaa\"}" localhost:3000/api/user/signup)" != 200 ]'

echo "== T7 no secret leakage =="
! grep -qF "$PW" "$WORK/run1.log" && ok "password is not in the sync script output" || bad "password is not in the sync script output"
check "password is not in the fake aws call log"           "! grep -qF '$PW' /var/log/fake-aws.log"
check "password is not in any container's environment or args" "! (docker inspect woobe-grafana woobe-prometheus woobe-node-exporter | grep -qF '$PW')"
check "password is not in any container's logs"            "! (docker logs woobe-grafana 2>&1; docker logs woobe-prometheus 2>&1) | grep -qF '$PW'"
check "password is not in the compose file on disk"        "! grep -rqF '$PW' /opt/woobe/observability --include=*.yml --include=*.json"

echo "== T7b Grafana authentication + exposure posture (the same verifier the local stack uses) =="
docker cp "$REPO/infra/observability/scripts/verify-grafana-security.sh" "$NAME:/root/verify-grafana-security.sh"
if docker exec "$NAME" bash /root/verify-grafana-security.sh runtime --container woobe-grafana --url http://127.0.0.1:3000 \
     --password-file /opt/woobe/observability/secrets/grafana-admin-password >"$WORK/gsec.out" 2>&1; then
  ok "verify-grafana-security.sh runtime: $(grep -c PASS "$WORK/gsec.out") checks passed, 0 failed (login, wrong password, anonymous, signup, effective settings, loopback-only bind, file mode 400 owner 472, no secret in inspect/logs)"
else
  bad "verify-grafana-security.sh runtime" "$(grep -E 'FAIL|effective value' "$WORK/gsec.out" | head -5)"
fi
grep -q "server.http_addr (host network: bind address is the exposure) = 127.0.0.1" "$WORK/gsec.out" && ok "effective server.http_addr is 127.0.0.1 (from the running Grafana, not the compose file)" || bad "effective server.http_addr is 127.0.0.1"
if GRAFANA_PASSWORD_FOR_SCAN="$PW" bash "$REPO/infra/observability/scripts/verify-grafana-security.sh" repo >"$WORK/gsec-repo.out" 2>&1; then
  ok "verify-grafana-security.sh repo: Terraform declares no Grafana password resource, and the generated password is in no repository file or recent commit"
else
  bad "verify-grafana-security.sh repo" "$(grep -E 'FAIL' -A2 "$WORK/gsec-repo.out" | head -6)"
fi

echo "== T8 idempotent re-run: nothing recreated, password unchanged =="
IDS_BEFORE="$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')"
SECRET_BEFORE="$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')"
if run_sync "$WORK/sync1.sh" "$WORK/run2.log"; then ok "second sync exits 0"; else bad "second sync exits 0" "$(tail -10 "$WORK/run2.log")"; fi
[ "$(dx 'docker inspect -f "{{.Id}}" woobe-node-exporter woobe-prometheus woobe-grafana')" = "$IDS_BEFORE" ] && ok "no container was recreated" || bad "no container was recreated"
[ "$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')" = "$SECRET_BEFORE" ] && ok "password file unchanged" || bad "password file unchanged"
! grep -qE "updated |created the Grafana|removed " "$WORK/run2.log" && ok "second run reports no changes" || bad "second run reports no changes" "$(grep -E 'updated |created |removed ' "$WORK/run2.log" | head -3)"
[ "$(dx 'grep -c put-parameter /var/log/fake-aws.log')" = 1 ] && ok "the parameter was created exactly once across both runs" || bad "the parameter was created exactly once"

echo "== T8b repeated runs (what the 12-hourly association does) restart NOTHING =="
SNAP_A="$(snap)"; HASH_A="$(tree_hash)"; SECRET_A="$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')"
for n in 1 2 3; do run_sync "$WORK/sync1.sh" "$WORK/run-rep$n.log" || bad "repeat run $n exits 0" "$(tail -5 "$WORK/run-rep$n.log")"; done
[ "$(snap)" = "$SNAP_A" ] && ok "three more runs: every container has the same ID, the same StartedAt and the same RestartCount (nothing restarted or recreated)" || bad "no container restarted or recreated" "before: $SNAP_A | after: $(snap)"
[ "$(tree_hash)" = "$HASH_A" ] && ok "the managed config tree is byte-identical after the repeated runs" || bad "config tree byte-identical"
[ "$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')" = "$SECRET_A" ] && ok "the password file is unchanged (credentials are not rotated)" || bad "password file unchanged"
! grep -hE "updated |created |removed |restarted|reloaded|corrected|fixed ownership" "$WORK"/run-rep*.log >/dev/null && ok "no repeated run reported ANY change or action" || bad "no repeated run reported any change" "$(grep -hE 'updated |created |removed |restarted|reloaded' "$WORK"/run-rep*.log | head -3)"
grep -q "converged:" "$WORK/run-rep3.log" && ok "each run ends with the single 'converged' line" || bad "converged line"
[ "$(stage_dirs)" = 0 ] && ok "no staging directory is left behind" || bad "no staging directory left behind"

echo "== T8c drift is corrected in place, without restarts and without losing data =="
dx 'echo keep > /opt/woobe/grafana-data/DRIFT_MARKER; echo keep > /opt/woobe/prometheus-data/DRIFT_MARKER'
SNAP_D="$(snap)"
dx 'chmod 644 /opt/woobe/observability/secrets/grafana-admin-password'
run_sync "$WORK/sync1.sh" "$WORK/run-drift1.log"
grep -q "corrected permissions of the Grafana password file" "$WORK/run-drift1.log" && ok "a world-readable password file (content unchanged) is detected and corrected" || bad "password-file mode drift corrected"
check "the password file is back to mode 400, owner 472:0, content unchanged" '[ "$(stat -c "%a %u:%g" /opt/woobe/observability/secrets/grafana-admin-password)" = "400 472:0" ]'
dx 'printf "not-the-password" > /opt/woobe/observability/secrets/grafana-admin-password'
run_sync "$WORK/sync1.sh" "$WORK/run-drift2.log"
[ "$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')" = "$SECRET_A" ] && ok "a locally EDITED password file is restored from the parameter store (SSM is the single source of truth)" || bad "locally edited password file restored"
dx 'chmod 600 /opt/woobe/observability/prometheus/prometheus.yml'
run_sync "$WORK/sync1.sh" "$WORK/run-drift3.log"
check "an unchanged config file with a drifted mode is re-asserted to 644 (Prometheus, running as nobody, must be able to read it)" '[ "$(stat -c %a /opt/woobe/observability/prometheus/prometheus.yml)" = 644 ]'
dx 'chown root:root /opt/woobe/grafana-data /opt/woobe/prometheus-data'
run_sync "$WORK/sync1.sh" "$WORK/run-drift4.log"
check "volume ownership drift is repaired (grafana-data 472:0, prometheus-data 65534:65534)" '[ "$(stat -c "%u:%g" /opt/woobe/grafana-data)" = "472:0" ] && [ "$(stat -c "%u:%g" /opt/woobe/prometheus-data)" = "65534:65534" ]'
check "ownership repair only changes ownership: the data is still there" '[ -e /opt/woobe/grafana-data/DRIFT_MARKER ] && [ -e /opt/woobe/prometheus-data/DRIFT_MARKER ] && [ -s /opt/woobe/grafana-data/grafana.db ]'
[ "$(snap)" = "$SNAP_D" ] && ok "correcting drift restarted nothing" || bad "correcting drift restarted nothing"

echo "== T9 config change: applied in place (Prometheus SIGHUP), no recreate =="
render "$WORK/sync2.sh" "" 77
if run_sync "$WORK/sync2.sh" "$WORK/run3.log"; then ok "sync with a changed alert rule exits 0"; else bad "sync with a changed alert rule exits 0" "$(tail -10 "$WORK/run3.log")"; fi
grep -q "updated prometheus/rules/woobe-alerts.rules.yml" "$WORK/run3.log" && ok "the changed rule file was updated" || bad "the changed rule file was updated"
grep -q "reloaded Prometheus configuration" "$WORK/run3.log" && ok "Prometheus was reloaded (SIGHUP)" || bad "Prometheus was reloaded"
[ "$(dx 'docker inspect -f "{{.Id}}" woobe-prometheus')" = "$(echo "$IDS_BEFORE" | sed -n 2p)" ] && ok "Prometheus container was not recreated" || bad "Prometheus container was not recreated"
# jq, not grep: Prometheus's Go JSON encoder escapes ">" as \u003e in the raw response.
check_eventually "Prometheus now serves the new threshold (> 77) after the reload" 'curl -s localhost:9090/api/v1/rules | jq -e "[.data.groups[].rules[] | select(.name==\"WoobeNotificationQueueBacklog\") | .query | contains(\"> 77\")] | any" >/dev/null'

echo "== T9b a DASHBOARD-only change: no restart of anything, and Grafana serves it (30s provisioning poll) =="
run_sync "$WORK/sync1.sh" "$WORK/run-b0.log"   # return to the baseline first (T9 left a changed threshold)
SNAP_B="$(snap)"
render "$WORK/sync-dash.sh" "" "" dashboard-title
run_sync "$WORK/sync-dash.sh" "$WORK/run-b1.log" && ok "sync with a changed dashboard exits 0" || bad "sync with a changed dashboard exits 0" "$(tail -5 "$WORK/run-b1.log")"
grep -q "updated grafana/dashboards/woobe-api-overview.json" "$WORK/run-b1.log" && ok "only the dashboard file was updated" || bad "dashboard file updated"
[ "$(grep -c 'updated ' "$WORK/run-b1.log")" = 1 ] && ok "exactly ONE file changed" || bad "exactly one file changed" "$(grep 'updated ' "$WORK/run-b1.log")"
! grep -qE "restarted Grafana|reloaded Prometheus" "$WORK/run-b1.log" && ok "neither Grafana was restarted nor Prometheus reloaded" || bad "no restart/reload for a dashboard change"
[ "$(snap)" = "$SNAP_B" ] && ok "no container restarted or recreated" || bad "no container restarted or recreated"
check_eventually "Grafana serves the edited dashboard title without a restart" "$(gf '/api/search?type=dash-db') | jq -e '[.[] | select(.title | test(\"edited\"))] | length > 0' >/dev/null"

echo "== T9c a DATASOURCE change restarts Grafana ONLY =="
run_sync "$WORK/sync1.sh" "$WORK/run-c0.log"; SNAP_C="$(snap)"
render "$WORK/sync-ds.sh" "" "" datasource
run_sync "$WORK/sync-ds.sh" "$WORK/run-c1.log" && ok "sync with a changed datasource exits 0" || bad "sync with a changed datasource exits 0" "$(tail -5 "$WORK/run-c1.log")"
grep -q "restarted Grafana to load the changed datasource" "$WORK/run-c1.log" && ok "Grafana was restarted to load the datasource" || bad "Grafana restarted for a datasource change"
[ "$(snap_of woobe-node-exporter)" = "$(echo "$SNAP_C" | grep woobe-node-exporter)" ] && [ "$(snap_of woobe-prometheus)" = "$(echo "$SNAP_C" | grep woobe-prometheus)" ] && ok "node-exporter and Prometheus were NOT touched" || bad "node-exporter and Prometheus untouched"
[ "$(snap_of woobe-grafana | awk '{print $3}')" != "$(echo "$SNAP_C" | grep woobe-grafana | awk '{print $3}')" ] && ok "Grafana's StartedAt changed (it really restarted)" || bad "Grafana restarted"
check "Grafana is healthy again and the SAME password still logs in" "$(gf /api/datasources) | grep -q woobe-prometheus"

echo "== T9d a COMPOSE change to one service recreates ONLY that service, keeping its data =="
run_sync "$WORK/sync1.sh" "$WORK/run-d0.log"; dx 'echo keep > /opt/woobe/grafana-data/T9D_MARKER'; SNAP_E="$(snap)"
render "$WORK/sync-compose.sh" "" "" compose-grafana
run_sync "$WORK/sync-compose.sh" "$WORK/run-d1.log" && ok "sync with a changed compose service exits 0" || bad "sync with a changed compose service exits 0" "$(tail -5 "$WORK/run-d1.log")"
[ "$(snap_of woobe-node-exporter)" = "$(echo "$SNAP_E" | grep woobe-node-exporter)" ] && [ "$(snap_of woobe-prometheus)" = "$(echo "$SNAP_E" | grep woobe-prometheus)" ] && ok "node-exporter and Prometheus were neither recreated nor restarted" || bad "node-exporter and Prometheus untouched"
[ "$(snap_of woobe-grafana | awk '{print $2}')" != "$(echo "$SNAP_E" | grep woobe-grafana | awk '{print $2}')" ] && ok "only Grafana was recreated (new container ID)" || bad "Grafana recreated"
check "Grafana's data survived the recreation, and the same password still works" "[ -e /opt/woobe/grafana-data/T9D_MARKER ] && [ -s /opt/woobe/grafana-data/grafana.db ] && $(gf /api/datasources) | grep -q woobe-prometheus"

echo "== T9e a scrape-TARGET change reloads Prometheus in place =="
run_sync "$WORK/sync1.sh" "$WORK/run-e0.log"; SNAP_F="$(snap)"
render "$WORK/sync-targets.sh" "" "" targets-only
run_sync "$WORK/sync-targets.sh" "$WORK/run-e1.log" && ok "sync with a changed target exits 0" || bad "sync with a changed target exits 0" "$(tail -5 "$WORK/run-e1.log")"
grep -q "reloaded Prometheus configuration (SIGHUP, accepted)" "$WORK/run-e1.log" && ok "Prometheus reloaded, and the sync CONFIRMED it accepted the configuration" || bad "Prometheus reload confirmed"
[ "$(snap)" = "$SNAP_F" ] && ok "no container restarted or recreated" || bad "no container restarted or recreated"
check_eventually "Prometheus now targets 127.0.0.1:4001" 'curl -s localhost:9090/api/v1/targets | jq -e ".data.activeTargets[] | select(.labels.job==\"woobe-api\" and .scrapeUrl==\"http://127.0.0.1:4001/metrics\")" >/dev/null'
run_sync "$WORK/sync1.sh" "$WORK/run-e2.log"

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

echo "== T13b a corrupt or INVALID artifact changes NOTHING on the host and fails with a clear message =="
run_sync "$WORK/sync1.sh" "$WORK/run-f0.log"
HASH_C="$(tree_hash)"; SNAP_G="$(snap)"; SECRET_G="$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')"
for variant in corrupt-payload bad-compose bad-prom-config; do
  case "$variant" in
    corrupt-payload) want="cannot decode the payload for prometheus/rules/woobe-alerts.rules.yml" ;;
    bad-compose)     want="the new docker-compose.yml is invalid" ;;
    bad-prom-config) want="promtool rejected the new Prometheus configuration" ;;
  esac
  render "$WORK/sync-$variant.sh" "" "" "$variant"
  if run_sync "$WORK/sync-$variant.sh" "$WORK/run-bad-$variant.log"; then bad "$variant: the sync FAILS (does not silently succeed)"; else ok "$variant: the sync FAILS (non-zero exit)"; fi
  grep -qF "$want" "$WORK/run-bad-$variant.log" && ok "$variant: the failure says exactly what is wrong" || bad "$variant: clear failure message" "$(tail -3 "$WORK/run-bad-$variant.log")"
  grep -q "nothing was changed\|no config file on the host was changed" "$WORK/run-bad-$variant.log" && ok "$variant: it states that nothing was changed" || bad "$variant: states nothing was changed"
  [ "$(tree_hash)" = "$HASH_C" ] && ok "$variant: the config tree on the host is byte-identical (atomic: no partial application, even though other files in the payload were valid and CHANGED)" || bad "$variant: config tree unchanged"
  [ "$(snap)" = "$SNAP_G" ] && ok "$variant: the running stack was not restarted, recreated or reloaded" || bad "$variant: running stack untouched"
  [ "$(stage_dirs)" = 0 ] && ok "$variant: no staging directory is left behind" || bad "$variant: no staging directory left behind"
  ! grep -qF "$PW" "$WORK/run-bad-$variant.log" && ok "$variant: no secret in the failure output" || bad "$variant: no secret in the failure output"
done
[ "$(dx 'sha256sum /opt/woobe/observability/secrets/grafana-admin-password')" = "$SECRET_G" ] && ok "the password file was not touched by any failed run" || bad "password file untouched by failed runs"
run_sync "$WORK/sync1.sh" "$WORK/run-f1.log" && ok "a valid sync right after the failures converges normally" || bad "a valid sync after failures converges" "$(tail -5 "$WORK/run-f1.log")"

echo "== T14 the authentication posture still holds after all of the above =="
docker exec "$NAME" bash /root/verify-grafana-security.sh runtime --container woobe-grafana --url http://127.0.0.1:3000 --password-file /opt/woobe/observability/secrets/grafana-admin-password >"$WORK/gsec2.out" 2>&1 \
  && ok "verify-grafana-security.sh runtime still passes ($(grep -c PASS "$WORK/gsec2.out") checks)" || bad "verify-grafana-security.sh runtime after the scenarios" "$(grep FAIL "$WORK/gsec2.out" | head -3)"
! grep -lF "$PW" "$WORK"/*.log "$WORK"/*.out 2>/dev/null | grep -q . && ok "the password appears in NO log/output produced by any run in this suite" || bad "the password appears in no log or output"

echo
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
