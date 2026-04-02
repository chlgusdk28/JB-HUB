#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: airgap-scan-wrapper.sh --image IMAGE [options]

Options:
  --image IMAGE
  --trivy-bin PATH
  --block-on SEVERITIES
  --skip-db-update 0|1

Defaults:
  AIRGAP_TRIVY_BIN=trivy
  AIRGAP_SCAN_BLOCK_SEVERITIES=CRITICAL,HIGH
  AIRGAP_TRIVY_SKIP_DB_UPDATE=1
EOF
}

fail() {
  printf '[airgap-scan-wrapper] %s\n' "$*" >&2
  exit 2
}

image=""
trivy_bin="${AIRGAP_TRIVY_BIN:-trivy}"
block_on="${AIRGAP_SCAN_BLOCK_SEVERITIES:-CRITICAL,HIGH}"
skip_db_update="${AIRGAP_TRIVY_SKIP_DB_UPDATE:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      image="${2-}"
      shift 2
      ;;
    --trivy-bin)
      trivy_bin="${2-}"
      shift 2
      ;;
    --block-on)
      block_on="${2-}"
      shift 2
      ;;
    --skip-db-update)
      skip_db_update="${2-}"
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
command -v "$trivy_bin" >/dev/null 2>&1 || fail "Trivy binary not found: $trivy_bin"

trivy_args=(image --format json)
if [[ "$skip_db_update" != "0" ]]; then
  trivy_args+=(--skip-db-update)
fi
if [[ -n "${AIRGAP_TRIVY_CACHE_DIR:-}" ]]; then
  trivy_args+=(--cache-dir "${AIRGAP_TRIVY_CACHE_DIR}")
fi

printf '[airgap-scan-wrapper] scanning image=%s with %s\n' "$image" "$trivy_bin" >&2

if ! scan_json="$("$trivy_bin" "${trivy_args[@]}" "$image")"; then
  exit $?
fi

summary_output="$(printf '%s' "$scan_json" | node -e '
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8").trim();
const blockOn = String(process.argv[1] || "CRITICAL,HIGH")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

let payload = {};
if (input) {
  try {
    payload = JSON.parse(input);
  } catch (error) {
    console.error("[airgap-scan-wrapper] failed to parse trivy JSON:", error.message);
    process.exit(3);
  }
}

const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const result of Array.isArray(payload.Results) ? payload.Results : []) {
  for (const vulnerability of Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities : []) {
    const severity = String(vulnerability.Severity || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(counts, severity)) {
      counts[severity] += 1;
    }
  }
}

const blocked = blockOn.filter((severity) => counts[severity] > 0);
console.log(`CRITICAL: ${counts.CRITICAL} HIGH: ${counts.HIGH} MEDIUM: ${counts.MEDIUM} LOW: ${counts.LOW}`);
if (blocked.length > 0) {
  console.error(`[airgap-scan-wrapper] blocking image due to severities: ${blocked.join(", ")}`);
  process.exit(1);
}
' "$block_on")"
summary_status=$?

printf '%s\n' "$summary_output"
exit "$summary_status"
