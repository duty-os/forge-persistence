#!/bin/bash

export VERSION=0.1

sudo docker load -i forge-persistence-private-${VERSION}.tar

mkdir -p config
mkdir -p logs
mkdir -p data

cp config.json.example config/config.json
