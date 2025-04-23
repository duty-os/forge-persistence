#!/bin/bash
set -ex;
export VERSION=1.0.2
rm -rf deploy/*.tar
sudo docker build . -t registry.netless.link/app/forge-persistence-private:$VERSION
sudo docker pull nginx:latest
sudo docker save nginx:latest -o deploy/nginx.tar
sudo docker save registry.netless.link/app/forge-persistence-private:$VERSION -o deploy/forge-persistence-private-$VERSION.tar
tar -czvf forge-persistence-private-$VERSION-install.tar deploy --transform s/deploy/forge-persistence/

