#!/bin/bash
# PreToolUse guard for Bash: before a destructive git command (checkout/restore/
# reset/clean) or `rm -rf`, require a clean working tree — i.e. `git status`
# has effectively already been checked and anything present was stashed or
# committed first. If the tree is dirty, escalate to a permission prompt
# instead of silently blocking, so the user (or Claude, out of auto mode) can
# still confirm intentionally.
set -euo pipefail

cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

is_destructive=0

# git checkout / restore / reset / clean
if echo "$cmd" | grep -qE '(^|[;&|]|\s)git\s+(checkout|restore|reset|clean)(\s|$)'; then
  is_destructive=1
fi

# rm with recursive AND force, in any flag arrangement (-rf, -fr, -r -f, --recursive --force, mixed)
if echo "$cmd" | grep -qE '(^|[;&|]|\s)rm(\s|$)'; then
  has_r=0
  has_f=0
  echo "$cmd" | grep -qE '(^|[;&|]|\s)rm\s+.*(-[a-zA-Z]*r[a-zA-Z]*(\s|$)|--recursive)' && has_r=1
  echo "$cmd" | grep -qE '(^|[;&|]|\s)rm\s+.*(-[a-zA-Z]*f[a-zA-Z]*(\s|$)|--force)' && has_f=1
  if [ "$has_r" = "1" ] && [ "$has_f" = "1" ]; then
    is_destructive=1
  fi
fi

[ "$is_destructive" = "0" ] && exit 0

# Only gate when inside a git work tree; outside one, let it through.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

dirty="$(git status --porcelain 2>/dev/null || true)"
if [ -n "$dirty" ]; then
  reason='Working tree has uncommitted changes. Run git status, then stash (git stash -u) or commit before running a destructive command (git checkout/restore/reset/clean or rm -rf).'
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
fi

exit 0
