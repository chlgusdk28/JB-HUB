#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: airgap-inspect-wrapper.sh --image IMAGE [--runtime-bin BIN]
EOF
}

fail() {
  printf '[airgap-inspect-wrapper] %s\n' "$*" >&2
  exit 2
}

image=""
runtime_bin="${AIRGAP_KANIKO_RUNTIME_BIN:-${CONTAINER_RUNTIME_BIN:-docker}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      image="${2-}"
      shift 2
      ;;
    --runtime-bin)
      runtime_bin="${2-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$image" ]] || fail "--image is required"
command -v "$runtime_bin" >/dev/null 2>&1 || fail "Runtime binary not found: $runtime_bin"

exec "$runtime_bin" image inspect "$image"
