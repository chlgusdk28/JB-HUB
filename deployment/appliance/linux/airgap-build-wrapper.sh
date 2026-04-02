#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: airgap-build-wrapper.sh --context PATH --dockerfile PATH --destination IMAGE [options]

Options:
  --context PATH
  --dockerfile PATH
  --destination IMAGE
  --platform PLATFORM
  --registry-mirror HOST
  --internal-registry HOST
  --cache-repo REPO
  --build-args STRING
  --additional-args STRING
  --runtime-bin BIN
  --kaniko-image IMAGE
  --docker-config-dir DIR

Notes:
  - This wrapper launches a Kaniko executor image through a local docker/nerdctl-compatible runtime.
  - --build-args and --additional-args are split on whitespace. Avoid spaces inside build-arg values.
EOF
}

fail() {
  printf '[airgap-build-wrapper] %s\n' "$*" >&2
  exit 2
}

append_split_args() {
  local raw="${1-}"
  local -n target_ref="$2"
  if [[ -z "$raw" ]]; then
    return 0
  fi

  local parts=()
  read -r -a parts <<<"$raw"
  if [[ ${#parts[@]} -gt 0 ]]; then
    target_ref+=("${parts[@]}")
  fi
}

context=""
dockerfile=""
destination=""
platform=""
registry_mirror=""
internal_registry=""
cache_repo=""
build_args_string=""
additional_args_string=""
runtime_bin=""
kaniko_image=""
docker_config_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)
      context="${2-}"
      shift 2
      ;;
    --dockerfile)
      dockerfile="${2-}"
      shift 2
      ;;
    --destination)
      destination="${2-}"
      shift 2
      ;;
    --platform)
      platform="${2-}"
      shift 2
      ;;
    --registry-mirror)
      registry_mirror="${2-}"
      shift 2
      ;;
    --internal-registry)
      internal_registry="${2-}"
      shift 2
      ;;
    --cache-repo)
      cache_repo="${2-}"
      shift 2
      ;;
    --build-args)
      build_args_string="${2-}"
      shift 2
      ;;
    --additional-args)
      additional_args_string="${2-}"
      shift 2
      ;;
    --runtime-bin)
      runtime_bin="${2-}"
      shift 2
      ;;
    --kaniko-image)
      kaniko_image="${2-}"
      shift 2
      ;;
    --docker-config-dir)
      docker_config_dir="${2-}"
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

runtime_bin="${runtime_bin:-${AIRGAP_KANIKO_RUNTIME_BIN:-${CONTAINER_RUNTIME_BIN:-docker}}}"
kaniko_image="${kaniko_image:-${AIRGAP_KANIKO_IMAGE:-}}"
docker_config_dir="${docker_config_dir:-${AIRGAP_KANIKO_DOCKER_CONFIG_DIR:-}}"
registry_mirror="${registry_mirror:-${AIRGAP_INTERNAL_REGISTRY_MIRROR:-}}"
internal_registry="${internal_registry:-${AIRGAP_INTERNAL_REGISTRY:-}}"
cache_repo="${cache_repo:-${AIRGAP_KANIKO_CACHE_REPO:-}}"
additional_args_string="${additional_args_string:-${AIRGAP_KANIKO_ADDITIONAL_ARGS:-}}"

[[ -n "$context" ]] || fail "--context is required"
[[ -n "$dockerfile" ]] || fail "--dockerfile is required"
[[ -n "$destination" ]] || fail "--destination is required"
[[ -n "$kaniko_image" ]] || fail "--kaniko-image or AIRGAP_KANIKO_IMAGE is required"
command -v "$runtime_bin" >/dev/null 2>&1 || fail "Runtime binary not found: $runtime_bin"

context="$(cd "$context" && pwd)"
[[ -d "$context" ]] || fail "Context directory does not exist: $context"

if [[ "$dockerfile" != /* ]]; then
  dockerfile="$(cd "$(dirname "$dockerfile")" && pwd)/$(basename "$dockerfile")"
fi
[[ -f "$dockerfile" ]] || fail "Dockerfile does not exist: $dockerfile"

case "$dockerfile" in
  "$context"/*)
    dockerfile_rel="${dockerfile#"$context"/}"
    ;;
  *)
    fail "Dockerfile must be located inside the context directory"
    ;;
esac

dockerfile_rel="${dockerfile_rel//\\//}"

runtime_args=(
  run
  --rm
  -v
  "${context}:/workspace/context:ro"
)

if [[ -n "$docker_config_dir" ]]; then
  runtime_args+=(-v "${docker_config_dir}:/kaniko/.docker:ro")
fi

runtime_args+=(
  "$kaniko_image"
  "--context=dir:///workspace/context"
  "--dockerfile=/workspace/context/${dockerfile_rel}"
  "--destination=${destination}"
)

if [[ -n "$platform" && "$platform" != "linux/amd64" ]]; then
  runtime_args+=("--custom-platform=${platform}")
fi
if [[ -n "$registry_mirror" ]]; then
  runtime_args+=("--registry-mirror=${registry_mirror}")
fi
if [[ -n "$internal_registry" ]]; then
  runtime_args+=("--insecure-registry=${internal_registry}")
fi
if [[ -n "$cache_repo" ]]; then
  runtime_args+=("--cache=true" "--cache-repo=${cache_repo}")
fi

append_split_args "$build_args_string" runtime_args
append_split_args "$additional_args_string" runtime_args

printf '[airgap-build-wrapper] runtime=%s image=%s destination=%s\n' "$runtime_bin" "$kaniko_image" "$destination" >&2
exec "$runtime_bin" "${runtime_args[@]}"
