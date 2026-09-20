#!/usr/bin/env bash
# Verifies Grafana's authentication and exposure posture against a RUNNING Grafana. The password is never
# printed, and is passed to curl on stdin (not argv) so it never appears in a process listing.
#
#   verify-grafana-security.sh runtime --container NAME --url URL --password-file PATH [--expect-mode 400] [--dev]
#       Checks the live instance:
#         1. valid password login works                        4. self-signup is not possible
#         2. a wrong password is rejected (401)                5. EFFECTIVE settings (admin API), not just the compose file
#         3. anonymous access is rejected                      6. exposure: loopback-only binding, no published/wildcard port
#         7. password file permissions/ownership               8. password not in the container's env, args or logs
#       --dev  = local development stack (bridge network, published on 127.0.0.1; password file mode is not enforced)
#
#   verify-grafana-security.sh repo [--repo-root DIR]      (reads the password from $GRAFANA_PASSWORD_FOR_SCAN, if set)
#       Static: Terraform declares NO Grafana-password resource (so it cannot be in state); the instance role's grant is a
#       single exact ARN; and the password value (when provided) is in no file under infra/ and in no state/plan file.
set -uo pipefail

MODE="${1:-}"; shift || true
CONTAINER=""; URL=""; PWFILE=""; EXPECT_MODE="400"; DEV=0; REPO_ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --password-file) PWFILE="$2"; shift 2 ;;
    --expect-mode) EXPECT_MODE="$2"; shift 2 ;;
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --dev) DEV=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; [ -z "${2:-}" ] || printf '        %s\n' "$2"; }
check() { # description command...
  local d="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi
}

# curl with credentials on STDIN (never argv). usage: gcurl <user> <password> [curl args...]
gcurl() { local u="$1" p="$2"; shift 2; printf 'user = "%s:%s"\n' "$u" "$p" | curl -s -K - "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

runtime() {
  [ -n "$CONTAINER" ] && [ -n "$URL" ] && [ -n "$PWFILE" ] || { echo "runtime needs --container --url --password-file" >&2; exit 2; }
  [ -s "$PWFILE" ] || { echo "password file $PWFILE missing/empty" >&2; exit 2; }
  local PW; PW="$(cat "$PWFILE")"
  local WRONG="definitely-not-the-password-$RANDOM"

  echo "== 1-4 authentication behaviour =="
  [ "$(printf 'user = "admin:%s"\n' "$PW" | curl -s -K - -o /dev/null -w '%{http_code}' "$URL/api/datasources")" = 200 ] && ok "valid admin password logs in (200)" || bad "valid admin password logs in (200)"
  [ "$(printf 'user = "admin:%s"\n' "$WRONG" | curl -s -K - -o /dev/null -w '%{http_code}' "$URL/api/datasources")" = 401 ] && ok "an invalid password is rejected (401)" || bad "an invalid password is rejected (401)"
  [ "$(code "$URL/api/datasources")" = 401 ] && ok "anonymous API access is rejected (401)" || bad "anonymous API access is rejected (401)"
  [ "$(code "$URL/api/dashboards/home")" = 401 ] && ok "anonymous dashboard API is rejected (401)" || bad "anonymous dashboard API is rejected (401)"
  [ "$(code "$URL/api/search")" = 401 ] && ok "anonymous search (dashboard listing) is rejected (401)" || bad "anonymous search is rejected (401)"
  local ui; ui="$(code "$URL/")"
  { [ "$ui" = 302 ] || [ "$ui" = 401 ]; } && ok "anonymous UI request is redirected to login / refused (HTTP $ui), not served" || bad "anonymous UI request is redirected/refused" "got HTTP $ui"
  local su; su="$(code -X POST -H 'Content-Type: application/json' -d '{"name":"x","email":"x@x.invalid","username":"x","password":"Aa1!aaaaaaaa"}' "$URL/api/user/signup")"
  [ "$su" != 200 ] && ok "self-signup is not possible (HTTP $su)" || bad "self-signup is not possible" "got 200"
  local su2; su2="$(code -X POST -H 'Content-Type: application/json' -d '{"name":"x","email":"x@x.invalid","login":"x","password":"Aa1!aaaaaaaa"}' "$URL/api/admin/users")"
  [ "$su2" = 401 ] && ok "anonymous user creation via the admin API is rejected (401)" || bad "anonymous user creation via the admin API is rejected" "got $su2"

  echo "== 5 effective settings (from the running Grafana, not from the compose file) =="
  local S; S="$(gcurl admin "$PW" "$URL/api/admin/settings")"
  setting() { printf '%s' "$S" | jq -r "$1" 2>/dev/null; }
  eq() { [ "$(setting "$2")" = "$3" ] && ok "$1 = $3" || bad "$1 = $3" "effective value: $(setting "$2")"; }
  eq "auth.anonymous.enabled"       '.["auth.anonymous"].enabled'        false
  eq "users.allow_sign_up"          '.users.allow_sign_up'               false
  eq "users.allow_org_create"       '.users.allow_org_create'            false
  eq "auth.disable_login_form"      '.auth.disable_login_form'           false
  eq "auth.basic.enabled"           '.["auth.basic"].enabled'            true
  eq "auth.proxy.enabled"           '.["auth.proxy"].enabled'            false
  eq "public_dashboards.enabled"    '.public_dashboards.enabled'         false
  eq "snapshots.external_enabled"   '.snapshots.external_enabled'        false
  eq "security.cookie_samesite"     '.security.cookie_samesite'          strict
  eq "security.disable_gravatar"    '.security.disable_gravatar'         true
  # Host-networked (production): the bind address IS the exposure, so it must be loopback. On a bridge network
  # (local dev) the process must listen on the container's own interface for a published port to reach it; there the
  # exposure is the publish address, verified in section 6 (127.0.0.1 only).
  if [ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$CONTAINER")" = host ]; then
    eq "server.http_addr (host network: bind address is the exposure)" '.server.http_addr' 127.0.0.1
  else
    ok "server.http_addr is $(setting '.server.http_addr') inside the container; exposure is the publish address (section 6)"
  fi
  eq "server.http_port"             '.server.http_port'                  3000
  [ "$(setting '.security.admin_password')" != "$PW" ] && ok "the settings API does not reveal the admin password" || bad "the settings API does not reveal the admin password"

  echo "== 6 exposure =="
  local net; net="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$CONTAINER")"
  if [ "$net" = host ]; then
    ok "container uses host networking (nothing is published; the bind address below is the whole exposure)"
    if command -v netstat >/dev/null 2>&1; then
      netstat -ltn 2>/dev/null | grep -qE '127\.0\.0\.1:3000 ' && ok "port 3000 listens on 127.0.0.1" || bad "port 3000 listens on 127.0.0.1"
      ! netstat -ltn 2>/dev/null | grep -E '(0\.0\.0\.0|:::|\*):3000 ' >/dev/null && ok "port 3000 is NOT listening on any wildcard/other address" || bad "port 3000 is NOT listening on any wildcard/other address"
    else
      bad "netstat available to inspect listeners"
    fi
  else
    local hostip; hostip="$(docker inspect -f '{{range $p,$b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}} {{end}}{{end}}' "$CONTAINER")"
    [ -n "$hostip" ] && [ "$(echo "$hostip" | tr ' ' '\n' | grep -v '^$' | grep -vc '^127\.0\.0\.1$')" = 0 ] \
      && ok "published port(s) are bound to 127.0.0.1 only ($hostip)" || bad "published ports are bound to 127.0.0.1 only" "HostIp: '$hostip'"
  fi
  [ "$(docker inspect -f '{{.HostConfig.Privileged}}' "$CONTAINER")" = false ] && ok "container is not privileged" || bad "container is not privileged"
  ! docker inspect -f '{{json .Mounts}}' "$CONTAINER" | grep -q docker.sock && ok "no Docker socket mounted" || bad "no Docker socket mounted"

  echo "== 7 password file =="
  if [ "$DEV" = 1 ]; then ok "development stack: password-file mode not enforced (gitignored, mode-700 directory)"
  else
    [ "$(stat -c '%a %u:%g' "$PWFILE" 2>/dev/null)" = "$EXPECT_MODE 472:0" ] && ok "password file is mode $EXPECT_MODE owned by 472:0" || bad "password file is mode $EXPECT_MODE owned by 472:0" "actual: $(stat -c '%a %u:%g' "$PWFILE" 2>/dev/null)"
    [ "$(stat -c %a "$(dirname "$PWFILE")" 2>/dev/null)" = 700 ] && ok "its directory is mode 700" || bad "its directory is mode 700"
  fi
  docker exec "$CONTAINER" sh -c 'test -n "$GF_SECURITY_ADMIN_PASSWORD__FILE" && test -z "$GF_SECURITY_ADMIN_PASSWORD"' >/dev/null 2>&1 \
    && ok "Grafana is configured with GF_SECURITY_ADMIN_PASSWORD__FILE and NOT a plaintext GF_SECURITY_ADMIN_PASSWORD" || bad "password comes from the file, not a plaintext env var"

  echo "== 8 the password appears nowhere it should not =="
  ! docker inspect "$CONTAINER" | grep -qF "$PW" && ok "not in the container's inspect output (env, args, labels)" || bad "not in the container's inspect output"
  ! docker logs "$CONTAINER" 2>&1 | grep -qF "$PW" && ok "not in the container's logs" || bad "not in the container's logs"
}

repo() {
  local root="${REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"
  echo "== static: Terraform must not know the Grafana password =="
  local tf="$root/infra/terraform"
  ! grep -rEn 'resource +"(random_password|aws_ssm_parameter|aws_secretsmanager_secret(_version)?)" +"[^"]*grafana' "$tf" --include='*.tf' >/dev/null \
    && ok "no Terraform resource declares a Grafana password/secret (so none can be in state)" || bad "no Terraform resource declares a Grafana password/secret"
  ! grep -rEn 'grafana' "$tf" --include='*.tf' --include='*.tfvars*' | grep -iE '(password|secret) *= *"[^"$]{6,}"' >/dev/null \
    && ok "no literal Grafana password in any Terraform file" || bad "no literal Grafana password in any Terraform file"
  local arns; arns="$(grep -rn 'Resource *= *local.grafana_param_arn' "$tf/modules/observability/main.tf" | wc -l | tr -d ' ')"
  [ "$arns" = 1 ] && ok "the instance role's grant is one exact parameter ARN (no wildcard)" || bad "the instance role's grant is one exact parameter ARN" "found $arns Resource lines"
  ! grep -n 'parameter/\*\|parameter\*\|Resource *= *"\*"' "$tf/modules/observability/main.tf" >/dev/null && ok "no wildcard SSM resource in the observability module" || bad "no wildcard SSM resource in the observability module"
  ! grep -qE '^\s*(GF_SECURITY_ADMIN_PASSWORD|GRAFANA_PASSWORD)\s*[:=]\s*\S' "$root/infra/observability/docker-compose.prod.yml" "$root/infra/observability/docker-compose.local.yml" \
    && ok "no plaintext Grafana password variable in either compose file" || bad "no plaintext Grafana password variable in either compose file"

  echo "== static: state / plan files must not be committed or present in the tree =="
  local stray; stray="$(find "$root/infra" \( -name '*.tfstate' -o -name '*.tfstate.*' -o -name '*.tfplan' -o -name 'tfplan*' -o -name 'terraform-plan-*' \) -not -path '*/.terraform/*' 2>/dev/null | head -5)"
  [ -z "$stray" ] && ok "no state or plan file under infra/" || bad "no state or plan file under infra/" "$stray"

  if [ -n "${GRAFANA_PASSWORD_FOR_SCAN:-}" ]; then
    echo "== static: the actual password value must be in no file in the repository =="
    ! grep -rIlF -- "$GRAFANA_PASSWORD_FOR_SCAN" "$root/infra" "$root/docs" "$root/.env.example" "$root/journal.md" --exclude-dir=.terraform --exclude-dir=node_modules --exclude-dir=.local-secrets 2>/dev/null | grep -q . \
      && ok "the password value appears in no file under infra/, docs/, .env.example or journal.md" || bad "the password value appears in no repository file"
    if command -v git >/dev/null 2>&1 && git -C "$root" rev-parse >/dev/null 2>&1; then
      local revs; revs="$(git -C "$root" rev-list --all 2>/dev/null | head -50 | tr '\n' ' ')"
      # shellcheck disable=SC2086  # $revs is a space-separated list of commit ids, intentionally split
      ! git -C "$root" grep -qF -- "$GRAFANA_PASSWORD_FOR_SCAN" $revs 2>/dev/null \
        && ok "the password value appears in none of the last 50 commits" || bad "the password value appears in no recent commit"
    fi
  else
    echo "  (no GRAFANA_PASSWORD_FOR_SCAN provided: value scan skipped)"
  fi
}

case "$MODE" in
  runtime) runtime ;;
  repo) repo ;;
  *) echo "usage: $0 runtime|repo ..." >&2; exit 2 ;;
esac
echo
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
