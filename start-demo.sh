#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d frontend/node_modules ]; then (cd frontend && npm ci); fi
dotnet build backend
ASPNETCORE_ENVIRONMENT=Development DemoMode=true dotnet run --no-build --no-launch-profile --project backend --urls http://127.0.0.1:5080 &
api_pid=$!
cleanup() { kill "$api_pid" "${web_pid:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
(cd frontend && npm run dev) &
web_pid=$!
echo "Open http://127.0.0.1:5173 — press Ctrl+C to stop both servers."
wait
