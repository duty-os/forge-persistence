#!/bin/bash
set -euo pipefail

export VERSION=1.0.3
COMMAND="${1:-setup}"
MODE="${2:-app}"

usage() {
  echo "Usage: ./setup.sh <init|setup|upgrade|doctor|smoke> [app|nginx]"
}

run_docker() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
    return
  fi
  sudo docker "$@"
}

run_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  sudo docker compose "$@"
}

verify_package() {
  [ -f manifest.json ]
  [ -f checksums.sha256 ]
  shasum -a 256 -c checksums.sha256 >/dev/null
}

render_nginx_config() {
  local mode="$1"

  if [ "$mode" != "nginx" ]; then
    return
  fi

  local tls_enabled
  tls_enabled=$(node -e 'const fs=require("fs"); const cfg=JSON.parse(fs.readFileSync("config/app.json","utf8")); process.stdout.write(cfg.tls && cfg.tls.enabled ? "true" : "false");')
  if [ "$tls_enabled" = "true" ]; then
    cp nginx.https.conf config/nginx.conf
  else
    cp nginx.http.conf config/nginx.conf
  fi
}

run_init() {
  local mode="$1"

  mkdir -p config logs data backup
  if [ ! -f config/app.json ]; then
    cp config.json.example config/app.json
    node -e 'const fs=require("fs"); const crypto=require("crypto"); const file="config/app.json"; const config=JSON.parse(fs.readFileSync(file,"utf8")); config.deployMode=process.argv[1]; config.admin.token=crypto.randomBytes(24).toString("hex"); fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);' "$mode"
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
  bash ./scripts/doctor.sh "$mode"
}

run_smoke() {
  local mode="$1"
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
