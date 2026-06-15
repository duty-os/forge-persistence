#!/bin/bash
set -ex;
VERSION=$(node -p -e "require('./package.json').version")
NGINX_IMAGE=nginx:1.27.5-alpine
echo $VERSION

rm -rf deploy/*.tar
sed "s/forge-persistence-private:latest/forge-persistence-private:$VERSION/" deploy/docker-compose.base.app.yaml > deploy/docker-compose.base.app.yaml.tmp
mv deploy/docker-compose.base.app.yaml.tmp deploy/docker-compose.base.app.yaml
sed "s/forge-persistence-private:latest/forge-persistence-private:$VERSION/" deploy/docker-compose.base.nginx.yaml > deploy/docker-compose.base.nginx.yaml.tmp
mv deploy/docker-compose.base.nginx.yaml.tmp deploy/docker-compose.base.nginx.yaml
cat deploy/docker-compose.base.app.yaml
cat deploy/docker-compose.base.nginx.yaml
docker build . -t registry.netless.link/app/forge-persistence-private:$VERSION
docker pull ${NGINX_IMAGE}
docker save ${NGINX_IMAGE} -o deploy/nginx.tar
docker save registry.netless.link/app/forge-persistence-private:$VERSION -o deploy/forge-persistence-private-$VERSION.tar
sed -i.bak "s/export VERSION=.*/export VERSION=$VERSION/" deploy/setup.sh
rm -f deploy/setup.sh.bak
cat > deploy/manifest.json <<EOF
{
  "packageVersion": "${VERSION}",
  "configSchemaVersion": 2,
  "defaultMode": "app",
  "supportedModes": ["app", "nginx"],
  "artifacts": {
    "appImageTar": "forge-persistence-private-${VERSION}.tar",
    "nginxImageTar": "nginx.tar"
  },
  "images": {
    "app": "registry.netless.link/app/forge-persistence-private:${VERSION}",
    "nginx": "${NGINX_IMAGE}"
  }
}
EOF
(
  cd deploy
  shasum -a 256 \
    manifest.json \
    config.json.example \
    setup.sh \
    docker-compose.base.app.yaml \
    docker-compose.base.nginx.yaml \
    docker-compose.override.yaml.example \
    nginx.conf \
    scripts/validate-config.js \
    scripts/config-merge.js \
    scripts/doctor.sh \
    scripts/smoke-test.sh \
    nginx.tar \
    forge-persistence-private-$VERSION.tar > checksums.sha256
)
rm -rf /private/tmp/forge-persistence-package
mkdir -p /private/tmp/forge-persistence-package
cp -R deploy /private/tmp/forge-persistence-package/forge-persistence
tar -czvf forge-persistence-private-$VERSION-install.tar -C /private/tmp/forge-persistence-package forge-persistence
