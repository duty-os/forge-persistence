#!/bin/bash
set -euo pipefail

export VERSION=1.0.3
MODE="${1:-app}"

usage() {
  echo "Usage: ./setup.sh [nginx]"
}

case "$MODE" in
  "app")
    COMPOSE_FILE="docker-compose.app.yaml"
    COMPOSE_FALLBACK="docker-compose.app.yaml.example"
    ;;
  "nginx")
    COMPOSE_FILE="docker-compose.nginx.yaml"
    COMPOSE_FALLBACK="docker-compose.nginx.yaml.example"
    ;;
  *)
    usage
    exit 1
    ;;
esac

mkdir -p config logs data
cp -n config.json.example config/app.json
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="$COMPOSE_FALLBACK"
fi
cp "$COMPOSE_FILE" docker-compose.yaml

sudo docker load -i "forge-persistence-private-${VERSION}.tar"

if [ "$MODE" = "nginx" ]; then
  sudo docker load -i nginx.tar
  cp -n nginx.conf config/nginx.conf
fi

sudo docker compose up -d
