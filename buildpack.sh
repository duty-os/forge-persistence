#!/bin/bash
set -ex;
export VERSION=1.0.0
sudo docker build . -t registry.netless.link/app/forge-persistence-private:$VERSION
docker save registry.netless.link/app/forge-persistence-private:$VERSION -o deploy/forge-persistence-private-$VERSION.tar
tar -czvf forge-persistence-private-$VERSION-install.tar deploy --transform s/deploy/forge-persistence/
