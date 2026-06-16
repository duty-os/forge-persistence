#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/docker-common.sh"

mode="${1:-app}"

run_docker info >/dev/null
run_docker_compose version >/dev/null
shasum -a 256 -c checksums.sha256 >/dev/null
node ./scripts/validate-config.js --file config/app.json --mode "$mode"
test -w config
test -w logs
test -w data
df -k . >/dev/null

if [ "$mode" = "nginx" ]; then
  cert_enabled=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls && cfg.tls.enabled ? "true" : "false");')
  if [ "$cert_enabled" = "true" ]; then
    cert_path=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls.certPath);')
    key_path=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls.keyPath);')
    [ -f "$cert_path" ]
    [ -f "$key_path" ]
    echo "PASS doctor: mode=${mode} tls=enabled cert=${cert_path} key=${key_path}"
    exit 0
  fi
  echo "PASS doctor: mode=${mode} tls=disabled http-only"
  exit 0
fi

echo "PASS doctor: mode=${mode}"
