#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
echo 'EmbodiedLens 3.2 - http://localhost:8008'
python3 -m http.server 8008 --bind 127.0.0.1
