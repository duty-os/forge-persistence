#!/bin/bash
set -ex;

export VERSION=1.0.0
sudo docker run --rm -d --name forge-persistence -v ./data:/app/data -v ./logs:/app/logs -v ./config:/app/config -p 3000:3000 registry.netless.link/app/forge-persistence-private:$VERSION