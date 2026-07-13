#!/bin/bash
# Boots the stack + a public cloudflared quick tunnel to the web app
# (random *.trycloudflare.com URL). Ctrl+C stops everything.
set -eu
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || {
  echo "cloudflared not installed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
}

# Pin the ports up front: the tunnel and the /api proxy both need to know exactly
# where the servers landed. Left to itself vite would silently shift to the next
# free port and the tunnel would serve whatever else holds 5173.
free_port() {
  p=$1
  while ss -ltn "sport = :$p" | grep -q LISTEN; do p=$((p + 1)); done
  echo "$p"
}

export PORT=$(free_port 3001)      # api (apps/api reads $PORT)
export WEB_PORT=$(free_port 5173)  # web (vite.config.ts reads $WEB_PORT, strict)
echo "==> ports: api :$PORT, web :$WEB_PORT"

[ -d node_modules ] || { echo "==> npm install"; npm install; }

echo "==> postgres"
docker compose up -d

echo "==> waiting for postgres"
until docker compose exec -T postgres pg_isready -U orbit >/dev/null 2>&1; do sleep 1; done

echo "==> migrate"
npm run db:migrate -w apps/api

echo "==> seed"
npm run db:seed -w apps/api

LOG=$(mktemp)
cloudflared tunnel --url "http://localhost:$WEB_PORT" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null' EXIT

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -n "$URL" ]; then
  echo ""
  echo "==> public URL: $URL"
  echo ""
else
  echo "==> tunnel URL not found; log at $LOG" >&2
fi

echo "==> starting api (:$PORT) + web (:$WEB_PORT)"
npm run dev
