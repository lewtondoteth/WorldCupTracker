#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_PID=""
CLIENT_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "${CLIENT_PID}" ]] && kill -0 "${CLIENT_PID}" 2>/dev/null; then
    kill "${CLIENT_PID}" 2>/dev/null || true
  fi

  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

cd "${ROOT_DIR}"

echo "Starting backend on http://localhost:5174"
(cd server && npm run dev) &
SERVER_PID=$!

echo "Starting frontend on http://localhost:5173"
(cd client && npm run dev -- --host 0.0.0.0) &
CLIENT_PID=$!

wait -n "${SERVER_PID}" "${CLIENT_PID}"
