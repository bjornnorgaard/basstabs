#!/usr/bin/env bash
set -euo pipefail
dockerfile=${1:-Dockerfile}
awk '
  /^[[:space:]]*FROM[[:space:]]+/ {
    ref = $2
  }
  END {
    if (!ref) {
      printf "no FROM lines found in %s\n", ARGV[1] > "/dev/stderr"
      exit 1
    }
    print ref
  }
' "$dockerfile"
