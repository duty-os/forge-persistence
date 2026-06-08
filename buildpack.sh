#!/bin/bash
set -ex;
VERSION=$(node -p -e "require('./package.json').version")
NGINX_IMAGE=nginx:1.27.5-alpine
echo $VERSION

rm -rf deploy/*.tar
sed  "s/forge-persistence-private:latest/forge-persistence-private:$VERSION/" deploy/docker-compose.app.yaml.example > deploy/docker-compose.app.yaml
sed  "s/forge-persistence-private:latest/forge-persistence-private:$VERSION/" deploy/docker-compose.nginx.yaml.example > deploy/docker-compose.nginx.yaml
cat deploy/docker-compose.app.yaml
cat deploy/docker-compose.nginx.yaml
docker build . -t registry.netless.link/app/forge-persistence-private:$VERSION
docker pull ${NGINX_IMAGE}
docker save ${NGINX_IMAGE} -o deploy/nginx.tar
docker save registry.netless.link/app/forge-persistence-private:$VERSION -o deploy/forge-persistence-private-$VERSION.tar
sed -i "s/export VERSION=.*/export VERSION=$VERSION/" deploy/setup.sh
tar -czvf forge-persistence-private-$VERSION-install.tar deploy --transform s/deploy/forge-persistence/
