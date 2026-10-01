#!/usr/bin/env bash
set -euo pipefail
sha=${1:-${GITHUB_SHA:?GITHUB_SHA is required}}
echo "$(TZ=Europe/Copenhagen date +%y.%m.%d-%H.%M)-${sha:0:7}"
