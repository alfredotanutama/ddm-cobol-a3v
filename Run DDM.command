#!/bin/zsh
cd "$(dirname "$0")"

# Uses `vercel dev` (not plain `vite`) so the /api/settings serverless function runs locally too —
# login, users, and broadcast read/write the shared Postgres DB. Env (DATABASE_URL, PORT, BASE_PATH)
# comes from the linked Vercel project's Development environment.
if ! curl -s -o /dev/null http://localhost:5173; then
  vercel dev --listen 5173 --yes > /tmp/ddm-ui.log 2>&1 &
  until curl -s -o /dev/null http://localhost:5173; do sleep 1; done
fi

open http://localhost:5173
