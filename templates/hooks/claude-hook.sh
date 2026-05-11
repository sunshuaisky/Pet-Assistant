#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EVENT_NAME="${1:-progress}"
SESSION_TITLE="${CLAUDE_TASK_TITLE:-${CLAUDE_SESSION_TITLE:-${PHOENIX_PET_SESSION_TITLE:-}}}"

ARGS=(
  "${PROJECT_ROOT}/scripts/map-hook-event.mjs" "${EVENT_NAME}"
  --provider claude \
  --quiet 1 \
  --session-id "${CLAUDE_SESSION_ID:-${PHOENIX_PET_SESSION_ID:-}}" \
  --cwd "${CLAUDE_CWD:-${PWD}}"
)

if [[ -n "${SESSION_TITLE}" ]]; then
  ARGS+=(--title "${SESSION_TITLE}")
fi

node "${ARGS[@]}"
