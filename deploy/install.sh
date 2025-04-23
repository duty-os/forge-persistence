#!/bin/bash
set -ex;

export VERSION=1.0.2

sudo docker load -i forge-persistence-private-${VERSION}.tar

mkdir -p config
mkdir -p logs
mkdir -p data

cp config.json.example config/app.json
