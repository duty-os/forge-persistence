#!/bin/bash

sudo docker run --name forge-persistence -v ./data:/app/data -v ./logs:/app/logs -v ./config:/app/config registry.netless.link/app/forge-persistence-private:0.1