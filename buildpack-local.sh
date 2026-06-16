#!/bin/bash
set -ex;

VERSION=$(node -p -e "require('./package.json').version")
NGINX_IMAGE=nginx:1.27.5-alpine
STAGE_DIR=/private/tmp/forge-persistence-package

echo $VERSION

rm -rf deploy/*.tar
perl -0pe "s#image: \\\"registry\\.netless\\.link/app/forge-persistence-private:[^\\\"]+\\\"#image: \\\"registry.netless.link/app/forge-persistence-private:$VERSION\\\"#g" deploy/docker-compose.base.app.yaml > deploy/docker-compose.base.app.yaml.tmp
mv deploy/docker-compose.base.app.yaml.tmp deploy/docker-compose.base.app.yaml
perl -0pe "s#image: \\\"registry\\.netless\\.link/app/forge-persistence-private:[^\\\"]+\\\"#image: \\\"registry.netless.link/app/forge-persistence-private:$VERSION\\\"#g" deploy/docker-compose.base.nginx.yaml > deploy/docker-compose.base.nginx.yaml.tmp
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
    nginx.http.conf \
    nginx.https.conf \
    scripts/docker-common.sh \
    scripts/validate-config.js \
    scripts/config-merge.js \
    scripts/doctor.sh \
    scripts/smoke-test.sh \
    scripts/print-next-steps.sh \
    nginx.tar \
    forge-persistence-private-$VERSION.tar > checksums.sha256
)
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp -R deploy "$STAGE_DIR/forge-persistence"
tar -czvf forge-persistence-private-$VERSION-install.tar -C "$STAGE_DIR" forge-persistence
