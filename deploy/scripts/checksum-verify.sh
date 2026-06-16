#!/bin/bash
set -euo pipefail

verify_checksums() {
  local checksum_file="${1:-checksums.sha256}"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$checksum_file" >/dev/null
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$checksum_file" >/dev/null
    return
  fi

  echo "missing checksum tool: need shasum or sha256sum" >&2
  return 1
}
