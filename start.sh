#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "📦 Preparing Attendance App..."

# Build backend
dotnet build backend

# Kill existing processes on 5080 and 5173 if any
lsof -ti:5080 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Start backend
echo "🚀 Starting Backend on http://127.0.0.1:5080..."
dotnet run --no-build --project backend --urls http://127.0.0.1:5080 &
api_pid=$!

# Cleanup on exit
cleanup() {
  echo "🛑 Stopping services..."
  kill "$api_pid" "${web_pid:-}" 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

# Wait for backend to be ready
for i in {1..20}; do
  if curl -s http://127.0.0.1:5080/api/status >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Start frontend
echo "✨ Starting Frontend on http://127.0.0.1:5173..."
(cd frontend && npm run dev) &
web_pid=$!

echo ""
echo "======================================================"
echo "  ✅ Both Backend & Frontend are running!"
echo "  🌐 Open Web App:    http://127.0.0.1:5173"
echo "  🔌 API Endpoint:    http://127.0.0.1:5080"
echo "  Press Ctrl+C to stop both servers."
echo "======================================================"
echo ""

wait
