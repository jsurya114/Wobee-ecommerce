#!/usr/bin/env bash
# Makes the outcome of the Deploy workflow explicit, so a green run can never be
# mistaken for "deployed" when nothing was deployed. Used by deploy.yml; the
# behavior is covered by test-deploy-status.sh.
#
#   deploy-status.sh gate    decide whether this run may deploy at all
#   deploy-status.sh result  summarize what actually happened
#
# gate   env: DEPLOY_ENABLED, REF (github.ref), EVENT (github.event_name),
#             GH_TOKEN + GITHUB_REPOSITORY + GITHUB_RUN_ID (to look for a manual deploy in flight)
#   - not refs/heads/main            -> FAILS the run (a deploy from another ref is a mistake)
#   - DEPLOY_ENABLED is not "true"   -> passes but reports DEPLOYMENT SKIPPED loudly
#   - ANOTHER manual (workflow_dispatch) deploy/rollback run is queued, waiting for
#     approval or running          -> blocked=true, enabled=false: this run is refused
#                                     loudly (result FAILS it) so it can never silently
#                                     replace or race an explicit operation
#   - otherwise                      -> enabled=true
# result env: GATE_RESULT, GATE_ENABLED, GATE_BLOCKED, CI_RESULT, APPROVE_RESULT, IMAGE_RESULT,
#             DEPLOY_RESULT (each a needs.<job>.result), IMAGE_TAG, IMAGE_DIGEST
#   - deploy succeeded               -> DEPLOYED
#   - blocked by a manual deploy     -> DEPLOYMENT BLOCKED — NOT DEPLOYED (exit 1)
#   - intentionally disabled         -> DEPLOYMENT SKIPPED (warning, not success)
#   - anything else                  -> DEPLOYMENT FAILED (exit 1)
set -euo pipefail

emit_output() { if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1" >>"$GITHUB_OUTPUT"; fi; }
emit_summary() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat >>"$GITHUB_STEP_SUMMARY"; else cat; fi; }

# Lists OTHER manual (workflow_dispatch) runs of the Deploy workflow that have not
# finished (queued, waiting for approval, in progress...). Prints one line each.
# Any non-zero exit means "could not find out" and the caller must fail closed.
active_manual_runs() {
  local rid="${GITHUB_RUN_ID:-}"
  case "$rid" in ''|*[!0-9]*) echo "GITHUB_RUN_ID is missing or not numeric" >&2; return 2 ;; esac
  "${GH_BIN:-gh}" api "repos/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}/actions/workflows/deploy.yml/runs?event=workflow_dispatch&per_page=50" \
    --jq ".workflow_runs[] | select(.status != \"completed\" and .id != ${rid}) | \"\(.html_url) (\(.status))\""
}

gate() {
  if [ "${REF:-}" != "refs/heads/main" ]; then
    emit_output "enabled=false"
    echo "::error::DEPLOYMENT REFUSED — production deploys run only from refs/heads/main, but this run is on '${REF:-unknown}'."
    emit_summary <<SUMMARY
### DEPLOYMENT REFUSED — nothing was deployed
This run is on \`${REF:-unknown}\`. Production deploys run only from \`main\` (the AWS role also trusts only \`main\`). Re-run the workflow from \`main\`.
SUMMARY
    exit 1
  fi

  if [ "${DEPLOY_ENABLED:-}" != "true" ]; then
    emit_output "enabled=false"
    echo "::warning::DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED. The repository variable DEPLOY_ENABLED is '${DEPLOY_ENABLED:-unset}', not 'true'."
    emit_summary <<SUMMARY
### DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED
The repository variable \`DEPLOY_ENABLED\` is **${DEPLOY_ENABLED:-unset}**, not \`true\`, so the approval, image and deploy jobs were skipped on purpose.
This run being green means only that CI passed. Set \`DEPLOY_ENABLED=true\` (Settings, Secrets and variables, Actions, Variables) once the AWS infrastructure exists.
SUMMARY
    exit 0
  fi

  local active
  if ! active="$(active_manual_runs)"; then
    emit_output "enabled=false"
    echo "::error::DEPLOYMENT REFUSED — could not check whether a manual deployment or rollback is in progress (GitHub API call failed). Failing closed."
    emit_summary <<SUMMARY
### DEPLOYMENT REFUSED — nothing was deployed
The gate could not query GitHub for in-flight manual deployments/rollbacks, so it refused to continue rather than risk racing one. Re-run the workflow.
SUMMARY
    exit 1
  fi
  if [ -n "$active" ]; then
    emit_output "enabled=false"
    emit_output "blocked=true"
    echo "::error::DEPLOYMENT BLOCKED — a manual deployment/rollback is queued or running; this run will NOT deploy: ${active//$'\n'/; }"
    emit_summary <<SUMMARY
### DEPLOYMENT BLOCKED — NOT DEPLOYED
An explicitly requested manual deployment/rollback is queued, waiting for approval, or running:

$(printf '%s\n' "$active" | sed 's/^/- /')

This run was refused so it can never silently replace or race that operation. CI still runs. When the manual run has finished, re-run this workflow if you still want this commit deployed (after a rollback you may deliberately NOT want to).
SUMMARY
    exit 0
  fi

  emit_output "enabled=true"
  echo "Deployment is enabled for ${REF}."
}

result() {
  local gate_result="${GATE_RESULT:-}" enabled="${GATE_ENABLED:-}" ci="${CI_RESULT:-}"
  local approve="${APPROVE_RESULT:-}" image="${IMAGE_RESULT:-}" deploy="${DEPLOY_RESULT:-}" blocked="${GATE_BLOCKED:-}"

  if [ "$deploy" = "success" ] && [ "$image" = "success" ]; then
    emit_summary <<SUMMARY
### DEPLOYED
\`${IMAGE_TAG:-unknown}\` (\`${IMAGE_DIGEST:-unknown}\`) is live: health, readiness and stability were verified on the instance.
SUMMARY
    echo "DEPLOYED: ${IMAGE_TAG:-unknown}"
    return 0
  fi

  if [ "$blocked" = "true" ]; then
    echo "::error::DEPLOYMENT BLOCKED — NOT DEPLOYED. A manual deployment/rollback was queued or running when this run started. CI: ${ci:-n/a}."
    emit_summary <<SUMMARY
### DEPLOYMENT BLOCKED — NOT DEPLOYED
A manual deployment/rollback was queued or running, so this run deployed nothing (CI: **${ci:-n/a}**). Re-run this workflow after that operation finishes if you still want this commit deployed.
SUMMARY
    return 1
  fi

  if [ "$gate_result" = "success" ] && [ "$enabled" != "true" ] && [ "$deploy" = "skipped" ]; then
    echo "::warning::DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED (DEPLOY_ENABLED is not true). CI result: ${ci:-n/a}."
    emit_summary <<SUMMARY
### DEPLOYMENT SKIPPED — NOTHING WAS DEPLOYED
Deployment is disabled (\`DEPLOY_ENABLED\` is not \`true\`). CI: **${ci:-n/a}**. This is not a successful deployment.
SUMMARY
    return 0
  fi

  echo "::error::DEPLOYMENT FAILED — NOT DEPLOYED. gate=${gate_result:-n/a} ci=${ci:-n/a} approve=${approve:-n/a} image=${image:-n/a} deploy=${deploy:-n/a}"
  emit_summary <<SUMMARY
### DEPLOYMENT FAILED — NOT DEPLOYED
| job | result |
|---|---|
| gate | ${gate_result:-n/a} |
| ci | ${ci:-n/a} |
| approve | ${approve:-n/a} |
| image | ${image:-n/a} |
| deploy | ${deploy:-n/a} |

If the deploy job ran, its log says whether an automatic rollback was attempted and whether it succeeded.
SUMMARY
  return 1
}

case "${1:-}" in
  gate) gate ;;
  result) result ;;
  *) echo "usage: $0 gate|result" >&2; exit 2 ;;
esac
