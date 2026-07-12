#!/bin/zsh
cd "$(dirname "$0")"
export PORT=5173 BASE_PATH=/

if ! curl -s -o /dev/null http://localhost:5173; then
  pnpm --filter @workspace/cobol-stream-tool run dev > /tmp/ddm-ui.log 2>&1 &
  until curl -s -o /dev/null http://localhost:5173; do sleep 1; done
fi

open http://localhost:5173
