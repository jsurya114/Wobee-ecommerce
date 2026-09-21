#!/usr/bin/env bash
# WF_CONC and TFDIR are read inside the eval'd strings passed to check().
# shellcheck disable=SC2034
# Tests for deploy-status.sh: no Docker, AWS or GitHub needed.
#   .github/scripts/test-deploy-status.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/deploy-status.sh"
pass=0; fail=0
WF="$HERE/../workflows/deploy.yml"
TFDIR="$HERE/../../infra/terraform"

# Fake `gh` binaries: no Actions API is contacted by these tests.
FAKES="$(mktemp -d)"
trap 'rm -rf "$FAKES"' EXIT
printf '#!/bin/sh\ntouch "$FAKES/none.called"\nexit 0\n' >"$FAKES/gh-none"                       # API says: nothing in flight
printf '#!/bin/sh\nprintf "https://github.com/o/r/actions/runs/999 (in_progress)\\n"\n' >"$FAKES/gh-active"   # a manual run is in flight
printf '#!/bin/sh\nprintf "https://github.com/o/r/actions/runs/998 (queued)\\nhttps://github.com/o/r/actions/runs/999 (waiting)\\n"\n' >"$FAKES/gh-two"
printf '#!/bin/sh\necho "gh: HTTP 500" >&2\nexit 1\n' >"$FAKES/gh-fail"                            # API error
chmod +x "$FAKES"/gh-*

# run <name> <expected-exit> <must-contain> <must-not-contain> -- VAR=value ... <mode>
run() {
  local name="$1" want="$2" has="$3" hasnt="$4"; shift 5
  local mode="${!#}" out rc outfile
  outfile="$(mktemp)"
  out="$(env -i PATH="$PATH" GITHUB_OUTPUT="$outfile" GITHUB_REPOSITORY=o/r GITHUB_RUN_ID=123 GH_BIN="$FAKES/gh-none" "${@:1:$#-1}" "$SCRIPT" "$mode" 2>&1)"; rc=$?
  out="$out
$(cat "$outfile")"
  rm -f "$outfile"
  local ok=true
  [ "$rc" -eq "$want" ] || ok=false
  if [ -n "$has" ]; then printf '%s' "$out" | grep -qF -- "$has" || ok=false; fi
  if [ -n "$hasnt" ]; then printf '%s' "$out" | grep -qF -- "$hasnt" && ok=false; fi
  if [ "$ok" = true ]; then pass=$((pass + 1)); echo "PASS  $name"; else fail=$((fail + 1)); echo "FAIL  $name (exit $rc, wanted $want)"; printf '%s\n' "$out" | sed 's/^/      | /'; fi
}

# ---- gate ----
run "gate: enabled on main -> enabled=true"            0 "enabled=true"  "SKIPPED" -- REF=refs/heads/main DEPLOY_ENABLED=true gate
run "gate: DEPLOY_ENABLED unset -> SKIPPED, not enabled" 0 "DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED" "enabled=true" -- REF=refs/heads/main gate
run "gate: DEPLOY_ENABLED=false -> SKIPPED"             0 "DEPLOYMENT SKIPPED" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=false gate
run "gate: DEPLOY_ENABLED=TRUE (wrong case) -> SKIPPED" 0 "DEPLOYMENT SKIPPED" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=TRUE gate
run "gate: dispatch from a feature branch -> refused, exit 1" 1 "DEPLOYMENT REFUSED" "enabled=true" -- REF=refs/heads/feature DEPLOY_ENABLED=true gate
run "gate: tag ref -> refused, exit 1"                  1 "DEPLOYMENT REFUSED" "enabled=true" -- REF=refs/tags/v1 DEPLOY_ENABLED=true gate

# ---- result ----
run "result: deploy success -> DEPLOYED"                0 "DEPLOYED: aaaa" "SKIPPED" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=success APPROVE_RESULT=success IMAGE_RESULT=success DEPLOY_RESULT=success IMAGE_TAG=aaaa IMAGE_DIGEST=sha256:x result
run "result: disabled -> SKIPPED warning, never DEPLOYED" 0 "DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED" "DEPLOYED:" -- GATE_RESULT=success GATE_ENABLED=false CI_RESULT=success APPROVE_RESULT=skipped IMAGE_RESULT=skipped DEPLOY_RESULT=skipped result
run "result: deploy failed -> FAILED exit 1"            1 "DEPLOYMENT FAILED" "DEPLOYED:" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=success APPROVE_RESULT=success IMAGE_RESULT=success DEPLOY_RESULT=failure result
run "result: image build failed -> FAILED exit 1"       1 "DEPLOYMENT FAILED" "DEPLOYED:" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=success APPROVE_RESULT=success IMAGE_RESULT=failure DEPLOY_RESULT=skipped result
run "result: CI failed -> FAILED exit 1 (not 'skipped')" 1 "DEPLOYMENT FAILED" "SKIPPED" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=failure APPROVE_RESULT=skipped IMAGE_RESULT=skipped DEPLOY_RESULT=skipped result
run "result: gate refused -> FAILED exit 1"             1 "DEPLOYMENT FAILED" "SKIPPED" -- GATE_RESULT=failure GATE_ENABLED= CI_RESULT=skipped APPROVE_RESULT=skipped IMAGE_RESULT=skipped DEPLOY_RESULT=skipped result
run "result: cancelled -> FAILED exit 1"                1 "DEPLOYMENT FAILED" "DEPLOYED:" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=success APPROVE_RESULT=success IMAGE_RESULT=cancelled DEPLOY_RESULT=cancelled result
run "result: deploy skipped but enabled -> FAILED (never SKIPPED)" 1 "DEPLOYMENT FAILED" "SKIPPED" -- GATE_RESULT=success GATE_ENABLED=true CI_RESULT=success APPROVE_RESULT=failure IMAGE_RESULT=skipped DEPLOY_RESULT=skipped result
run "result: nothing known -> FAILED exit 1"            1 "DEPLOYMENT FAILED" "DEPLOYED:" -- result
run "bad usage -> exit 2"                               2 "usage:" "" -- nonsense

# ---- gate: manual deployment/rollback in flight (concurrency safety) ----
run "gate: a manual run is in flight -> BLOCKED, enabled=false, exit 0 (CI still runs)" 0 "DEPLOYMENT BLOCKED" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-active" gate
run "gate: BLOCKED sets blocked=true and names the run"  0 "blocked=true" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-active" gate
run "gate: BLOCKED lists the blocking run URL"           0 "actions/runs/999" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-active" gate
run "gate: two manual runs in flight -> both listed"     0 "actions/runs/998" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-two" gate
run "gate: nothing in flight -> enabled=true, not blocked" 0 "enabled=true" "blocked=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-none" gate
run "gate: GitHub API error -> fails closed (exit 1), never enabled" 1 "could not check" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-fail" gate
run "gate: bad GITHUB_RUN_ID -> fails closed (exit 1)"   1 "could not check" "enabled=true" -- REF=refs/heads/main DEPLOY_ENABLED=true GITHUB_RUN_ID=abc gate
rm -f "$FAKES/none.called"
run "gate: disabled deployment does not even query the API" 0 "DEPLOYMENT SKIPPED" "BLOCKED" -- REF=refs/heads/main DEPLOY_ENABLED=false GH_BIN="$FAKES/gh-none" gate
if [ -e "$FAKES/none.called" ]; then fail=$((fail + 1)); echo "FAIL  gate: gh was called although deployment is disabled"; else pass=$((pass + 1)); echo "PASS  gate: gh not called when deployment is disabled"; fi
rm -f "$FAKES/none.called"
run "gate: non-main ref is refused before any API call"  1 "DEPLOYMENT REFUSED" "BLOCKED" -- REF=refs/heads/feature DEPLOY_ENABLED=true GH_BIN="$FAKES/gh-none" gate
if [ -e "$FAKES/none.called" ]; then fail=$((fail + 1)); echo "FAIL  gate: gh was called for a non-main ref"; else pass=$((pass + 1)); echo "PASS  gate: gh not called for a non-main ref"; fi

# ---- result: blocked ----
run "result: blocked -> BLOCKED exit 1, never SKIPPED or DEPLOYED" 1 "DEPLOYMENT BLOCKED — NOT DEPLOYED" "SKIPPED" -- GATE_RESULT=success GATE_ENABLED=false GATE_BLOCKED=true CI_RESULT=success APPROVE_RESULT=skipped IMAGE_RESULT=skipped DEPLOY_RESULT=skipped result
run "result: blocked wins even when CI passed and deploy skipped" 1 "BLOCKED" "DEPLOYED:" -- GATE_RESULT=success GATE_ENABLED=false GATE_BLOCKED=true CI_RESULT=success DEPLOY_RESULT=skipped result

# ---- workflow structure: concurrency + OIDC properties that must not regress ----
block() { awk -v k="$1" '$0 ~ "^  "k":$" {f=1; print; next} f && /^  [a-z-]+:$/ {exit} f {print}' "$WF"; }
check() { # name, command evaluated against the workflow text
  if eval "$2" >/dev/null 2>&1; then pass=$((pass + 1)); echo "PASS  workflow: $1"; else fail=$((fail + 1)); echo "FAIL  workflow: $1"; fi
}
WF_CONC="$(sed -n '/^concurrency:/,/^$/p' "$WF")"
check "run-level group: pushes share 'production-push'"            'printf "%s" "$WF_CONC" | grep -q "production-push"'
check "run-level group: a manual run gets its OWN group (github.run_id) so a push cannot replace it" 'printf "%s" "$WF_CONC" | grep -q "workflow_dispatch" && printf "%s" "$WF_CONC" | grep -q "github.run_id"'
check "run-level group: cancel-in-progress is false"               'printf "%s" "$WF_CONC" | grep -q "cancel-in-progress: false"'
check "no cancel-in-progress: true anywhere (a running deploy is never cancelled)" '! grep -q "cancel-in-progress: true" "$WF"'
check "deploy job holds the shared lock group 'production-deploy'" 'block deploy | grep -q "group: production-deploy"'
check "deploy job lock: cancel-in-progress false"                  'block deploy | grep -q "cancel-in-progress: false"'
check "only ONE job carries a concurrency lock at job level (deploy)" '[ "$(grep -c "^    concurrency:" "$WF")" = 1 ]'
check "gate can read Actions runs (actions: read) and gets a token" 'block gate | grep -q "actions: read" && block gate | grep -q "GH_TOKEN"'
check "gate exposes the blocked output; result receives it"        'block gate | grep -q "blocked:" && block result | grep -q "GATE_BLOCKED"'
check "environment: appears exactly once, on the non-AWS approve job" '[ "$(grep -c "^    environment:" "$WF")" = 1 ] && block approve | grep -q "environment: production"'
check "AWS jobs (image, deploy) declare no environment"            '! block image | grep -q "environment:" && ! block deploy | grep -q "environment:"'
check "id-token: write only on the two AWS jobs"                   '[ "$(grep -c "id-token: write" "$WF")" = 2 ] && block image | grep -q "id-token: write" && block deploy | grep -q "id-token: write"'
# The default value here is expected to change if the repo/owner is ever
# renamed again (GitHub then permanently suffixes new numeric IDs onto the
# OIDC sub claim — see infra/terraform/modules/github-oidc/variables.tf) --
# this check guards the STRUCTURE (subject built from a branch ref, never an
# environment), not a specific repository name.
check "OIDC trust subject unchanged (branch ref, no environment)"  'grep -q "subject   = \"repo:\${var.github_repository}:ref:refs/heads/\${var.github_branch}\"" "$TFDIR/modules/github-oidc/main.tf" && ! grep -q "environment:" "$TFDIR/modules/github-oidc/main.tf" && grep -q "default     = \"jsurya114@187753860/Wobee-ecommerce@1345844181\"" "$TFDIR/environments/production/variables.tf"'

# Regression (2026-09-21): deploy.sh piped its startup/diagnostic `docker ps
# -a` line through `head -6`. Once the container fleet grew past 6 lines
# (woobe-api + woobe-worker joined the 5 observability containers = 7
# containers + a header = 8 lines), `head -6` closed early, SIGPIPEd the
# still-writing `docker ps -a`, and `set -eu -o pipefail` aborted deploy.sh
# on the spot -- before pull, migrate, or the candidate phase ever ran. This
# silently failed EVERY deploy (exit 141, no application error) until fixed.
# Guards against reintroducing any fixed-line head on that command.
check "deploy.sh docker-ps diagnostics: no fixed-line head (SIGPIPE regression)" '! grep -q "docker ps -a --filter name=.\^woobe-. 2>&1 | head" "$TFDIR/modules/ssm-deploy/deploy.sh"'

echo; echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
