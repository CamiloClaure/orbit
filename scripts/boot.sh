#!/bin/bash
# Boots the whole stack: postgres, migrate, seed (idempotent), api + web dev servers.
set -eu
cd "$(dirname "$0")/.."

[ -d node_modules ] || { echo "==> npm install"; npm install; }

echo "==> postgres"
docker compose up -d

echo "==> waiting for postgres"
until docker compose exec -T postgres pg_isready -U orbit >/dev/null 2>&1; do sleep 1; done

echo "==> migrate"
npm run db:migrate -w apps/api

echo "==> seed"
npm run db:seed -w apps/api

echo "==> starting api (:3001) + web (:5173)"
npm run dev
