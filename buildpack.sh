#!/bin/bash
set -ex;
VERSION=$(node -p -e "require('./package.json').version")
echo $VERSION

rm -rf deploy/*.tar
sed  "s/forge-persistence-private:latest/forge-persistence-private:$VERSION/" deploy/docker-compose.yaml.example > deploy/docker-compose.yaml
cat deploy/docker-compose.yaml
docker build . -t registry.netless.link/app/forge-persistence-private:$VERSION
docker pull nginx:latest
docker save nginx:latest -o deploy/nginx.tar
docker save registry.netless.link/app/forge-persistence-private:$VERSION -o deploy/forge-persistence-private-$VERSION.tar
tar -czvf forge-persistence-private-$VERSION-install.tar deploy --transform s/deploy/forge-persistence/

