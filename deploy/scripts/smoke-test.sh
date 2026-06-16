#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/docker-common.sh"

mode="${1:-app}"
token=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write((cfg.admin && cfg.admin.token) || "");')

if [ "$mode" = "app" ]; then
  curl -fsS http://127.0.0.1:3000/snapshot/test-room >/dev/null
  curl -fsS -H "X-Admin-Token: ${token}" http://127.0.0.1:3000/admin/disk/cleanup/status >/dev/null
else
  curl -fsS http://127.0.0.1/snapshot/test-room >/dev/null
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/admin/disk/cleanup/status)
  [ "$code" = "403" ]
  run_docker_compose -f docker-compose.generated.yaml -f docker-compose.override.yaml exec -T forge-persistence curl -fsS -H "X-Admin-Token: ${token}" http://127.0.0.1:3000/admin/disk/cleanup/status >/dev/null
  tls_enabled=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls && cfg.tls.enabled ? "true" : "false");')
  if [ "$tls_enabled" = "true" ]; then
    curl -ksfS https://127.0.0.1/snapshot/test-room >/dev/null
  fi
fi

echo "PASS smoke: mode=${mode}"
