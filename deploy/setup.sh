#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/scripts/docker-common.sh"
source "$(dirname "$0")/scripts/checksum-verify.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export VERSION=1.0.4
COMMAND="${1:-setup}"
MODE="${2:-app}"

usage() {
  echo "Usage: ./setup.sh <init|setup|upgrade|doctor|smoke> [app|nginx]"
}

require_mode() {
  local mode="$1"

  case "$mode" in
    "app"|"nginx")
      ;;
    *)
      echo "invalid deploy mode: $mode" >&2
      return 1
      ;;
  esac
}

verify_package() {
  [ -f manifest.json ]
  [ -f checksums.sha256 ]
  verify_checksums checksums.sha256
}

render_nginx_config() {
  local mode="$1"

  if [ "$mode" != "nginx" ]; then
    return
  fi

  local cert_path
  local key_path
  local tls_enabled
  tls_enabled=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls && cfg.tls.enabled ? "true" : "false");')
  if [ "$tls_enabled" = "true" ]; then
    cert_path=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls.certPath);')
    key_path=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls.keyPath);')
    [ "$cert_path" = "./config/tls/tls.crt" ] || {
      echo "tls certificates must stay under ./config/tls as tls.crt/tls.key" >&2
      return 1
    }
    [ "$key_path" = "./config/tls/tls.key" ] || {
      echo "tls certificates must stay under ./config/tls as tls.crt/tls.key" >&2
      return 1
    }
    [ -f "$cert_path" ] || {
      echo "missing tls certificate file: $cert_path" >&2
      return 1
    }
    [ -f "$key_path" ] || {
      echo "missing tls key file: $key_path" >&2
      return 1
    }
    cp nginx.https.conf config/nginx.conf
  else
    cp nginx.http.conf config/nginx.conf
  fi
}

run_init() {
  local mode="$1"

  require_mode "$mode"
  mkdir -p config logs data backup
  if [ ! -f config/app.json ]; then
    cp config.json.example config/app.json
    node -e 'const fs=require("fs"); const crypto=require("crypto"); const file="config/app.json"; const config=JSON.parse(fs.readFileSync(file,"utf8")); config.deployMode=process.argv[1]; config.admin.token=crypto.randomBytes(32).toString("hex"); fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);' "$mode"
  fi
  if [ ! -f docker-compose.override.yaml ]; then
    cp docker-compose.override.yaml.example docker-compose.override.yaml
  fi
  if [ "$mode" = "nginx" ]; then
    mkdir -p config/tls
    if [ ! -f config/nginx.conf ]; then
      cp nginx.http.conf config/nginx.conf
    fi
  fi
  bash ./scripts/print-next-steps.sh "$mode"
}

run_setup() {
  local mode="$1"

  require_mode "$mode"
  run_init "$mode"
  verify_package
  node ./scripts/validate-config.js --file config/app.json --mode "$mode"
  cp "docker-compose.base.${mode}.yaml" docker-compose.generated.yaml
  render_nginx_config "$mode"
  run_docker load -i "forge-persistence-private-${VERSION}.tar"
  if [ "$mode" = "nginx" ]; then
    run_docker load -i nginx.tar
  fi
  run_docker_compose -f docker-compose.generated.yaml -f docker-compose.override.yaml up -d
}

run_upgrade() {
  local mode="$1"

  require_mode "$mode"
  verify_package
  mkdir -p backup
  if [ -f config/app.json ]; then
    cp -f config/app.json "backup/app.json.$(date +%Y%m%d%H%M%S)"
    node ./scripts/config-merge.js --defaults config.json.example --current config/app.json --output config/app.json
  fi
  if [ -f config/nginx.conf ]; then
    cp -f config/nginx.conf "backup/nginx.conf.$(date +%Y%m%d%H%M%S)"
  fi
  if [ -f docker-compose.override.yaml ]; then
    cp -f docker-compose.override.yaml "backup/docker-compose.override.yaml.$(date +%Y%m%d%H%M%S)"
  fi
  run_setup "$mode"
}

run_doctor() {
  local mode="$1"
  require_mode "$mode"
  bash ./scripts/doctor.sh "$mode"
}

run_smoke() {
  local mode="$1"
  require_mode "$mode"
  bash ./scripts/smoke-test.sh "$mode"
}

case "$COMMAND" in
  "init")
    run_init "$MODE"
    ;;
  "setup")
    run_setup "$MODE"
    ;;
  "upgrade")
    run_upgrade "$MODE"
    ;;
  "doctor")
    run_doctor "$MODE"
    ;;
  "smoke")
    run_smoke "$MODE"
    ;;
  "app"|"nginx")
    run_setup "$COMMAND"
    ;;
  *)
    usage
    exit 1
    ;;
esac
