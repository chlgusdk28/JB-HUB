#!/usr/bin/env bash
set -euo pipefail

appliance_log() {
  printf '[appliance] %s\n' "$*"
}

appliance_warn() {
  printf '[appliance] WARN: %s\n' "$*" >&2
}

appliance_fail() {
  printf '[appliance] ERROR: %s\n' "$*" >&2
  exit 1
}

appliance_default_bundle_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../../.." && pwd
}

appliance_require_bundle_layout() {
  local bundle_root="$1"
  [[ -d "${bundle_root}/app" ]] || appliance_fail "Bundle app directory is missing: ${bundle_root}/app"
  [[ -d "${bundle_root}/deployment/appliance/linux" ]] || appliance_fail "Bundle deployment directory is missing: ${bundle_root}/deployment/appliance/linux"
}

appliance_resolve_node_bin() {
  local requested="${1-}"
  local bundled_node_bin="${2-}"
  if [[ -n "$requested" ]]; then
    printf '%s\n' "$requested"
    return 0
  fi

  if [[ -n "$bundled_node_bin" ]]; then
    printf '%s\n' "$bundled_node_bin"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  printf '/usr/bin/node\n'
}

appliance_assert_root_or_dry_run() {
  local dry_run="${1:-0}"
  local skip_user_setup="${2:-0}"
  local skip_systemd="${3:-0}"
  if [[ "$dry_run" == "1" ]]; then
    return 0
  fi

  if [[ "$(id -u)" -ne 0 ]]; then
    if [[ "$skip_user_setup" == "1" && "$skip_systemd" == "1" ]]; then
      appliance_warn 'Running without root because user setup and systemd actions were both skipped.'
      return 0
    fi

    appliance_fail 'This action must be run as root unless --dry-run is set, or both --skip-user-setup and --skip-systemd are enabled.'
  fi
}

appliance_mkdir() {
  local target="$1"
  local dry_run="${2:-0}"
  if [[ "$dry_run" == "1" ]]; then
    appliance_log "mkdir -p ${target}"
    return 0
  fi

  mkdir -p "$target"
}

appliance_rm_rf() {
  local target="$1"
  local dry_run="${2:-0}"
  if [[ "$dry_run" == "1" ]]; then
    appliance_log "rm -rf ${target}"
    return 0
  fi

  rm -rf "$target"
}

appliance_copy_tree() {
  local source="$1"
  local target="$2"
  local dry_run="${3:-0}"
  [[ -d "$source" ]] || appliance_fail "Source directory does not exist: ${source}"

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "copy tree ${source} -> ${target}"
    return 0
  fi

  mkdir -p "$target"
  cp -a "${source}/." "$target/"
}

appliance_replace_tree() {
  local source="$1"
  local target="$2"
  local dry_run="${3:-0}"
  [[ -d "$source" ]] || appliance_fail "Source directory does not exist: ${source}"

  appliance_rm_rf "$target" "$dry_run"
  appliance_mkdir "$target" "$dry_run"
  appliance_copy_tree "$source" "$target" "$dry_run"
}

appliance_copy_file() {
  local source="$1"
  local target="$2"
  local dry_run="${3:-0}"
  [[ -f "$source" ]] || appliance_fail "Source file does not exist: ${source}"

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "copy file ${source} -> ${target}"
    return 0
  fi

  mkdir -p "$(dirname "$target")"
  cp -f "$source" "$target"
}

appliance_extract_archive() {
  local source="$1"
  local target="$2"
  local dry_run="${3:-0}"
  [[ -f "$source" ]] || appliance_fail "Archive does not exist: ${source}"

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "extract archive ${source} -> ${target}"
    return 0
  fi

  mkdir -p "$target"
  case "$source" in
    *.tar.gz|*.tgz|*.tar.xz|*.tar.bz2|*.tar)
      tar -xf "$source" -C "$target"
      ;;
    *.zip)
      if ! command -v unzip >/dev/null 2>&1; then
        appliance_fail "unzip is required to extract ${source}"
      fi
      unzip -oq "$source" -d "$target"
      ;;
    *)
      appliance_fail "Unsupported archive format: ${source}"
      ;;
  esac
}

appliance_copy_if_exists() {
  local source="$1"
  local target="$2"
  local dry_run="${3:-0}"
  if [[ ! -e "$source" ]]; then
    return 0
  fi

  if [[ -d "$source" ]]; then
    appliance_replace_tree "$source" "$target" "$dry_run"
    return 0
  fi

  appliance_copy_file "$source" "$target" "$dry_run"
}

appliance_backup_path() {
  local source="$1"
  local backup_target="$2"
  local dry_run="${3:-0}"
  if [[ ! -e "$source" ]]; then
    return 0
  fi

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "backup ${source} -> ${backup_target}"
    return 0
  fi

  mkdir -p "$(dirname "$backup_target")"
  if [[ -d "$source" ]]; then
    rm -rf "$backup_target"
    mkdir -p "$backup_target"
    cp -a "${source}/." "$backup_target/"
  else
    cp -f "$source" "$backup_target"
  fi
}

appliance_setup_user_group() {
  local app_user="$1"
  local app_group="$2"
  local dry_run="${3:-0}"
  local skip_user_setup="${4:-0}"

  if [[ "$skip_user_setup" == "1" ]]; then
    appliance_log "Skipping user and group setup."
    return 0
  fi

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "ensure group ${app_group}"
    appliance_log "ensure user ${app_user}"
    return 0
  fi

  if ! getent group "$app_group" >/dev/null 2>&1; then
    groupadd --system "$app_group"
  fi

  if ! id -u "$app_user" >/dev/null 2>&1; then
    useradd --system --gid "$app_group" --home-dir /nonexistent --shell /usr/sbin/nologin "$app_user"
  fi
}

appliance_chown_path() {
  local target="$1"
  local app_user="$2"
  local app_group="$3"
  local dry_run="${4:-0}"
  local skip_user_setup="${5:-0}"

  if [[ "$skip_user_setup" == "1" || ! -e "$target" ]]; then
    return 0
  fi

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "chown -R ${app_user}:${app_group} ${target}"
    return 0
  fi

  chown -R "${app_user}:${app_group}" "$target"
}

appliance_install_env_file() {
  local example_path="$1"
  local target_path="$2"
  local overwrite_existing="${3:-0}"
  local dry_run="${4:-0}"

  if [[ -f "$target_path" && "$overwrite_existing" != "1" ]]; then
    appliance_log "Keeping existing env file: ${target_path}"
    return 0
  fi

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "install env template ${example_path} -> ${target_path}"
    return 0
  fi

  mkdir -p "$(dirname "$target_path")"
  cp -f "$example_path" "$target_path"
}

appliance_install_service_file() {
  local target_path="$1"
  local install_root="$2"
  local env_file="$3"
  local node_bin="$4"
  local app_user="$5"
  local app_group="$6"
  local dry_run="${7:-0}"

  local content
  content=$(cat <<EOF
[Unit]
Description=JB-HUB Appliance
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${install_root}/app
EnvironmentFile=${env_file}
ExecStart=${node_bin} server/sqlite-api.js
Restart=always
RestartSec=5
User=${app_user}
Group=${app_group}

[Install]
WantedBy=multi-user.target
EOF
)

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "write service file ${target_path}"
    return 0
  fi

  mkdir -p "$(dirname "$target_path")"
  printf '%s\n' "$content" > "$target_path"
}

appliance_find_bundled_node_archive() {
  local install_root="$1"
  local runtime_dir="${install_root}/runtime"
  if [[ ! -d "$runtime_dir" ]]; then
    return 0
  fi

  find "$runtime_dir" -maxdepth 1 -type f -name 'appliance-node-archive*' | sort | head -n 1
}

appliance_find_node_executable() {
  local search_root="$1"
  if [[ ! -d "$search_root" ]]; then
    return 0
  fi

  local direct_candidates=(
    "${search_root}/bin/node"
    "${search_root}/node"
    "${search_root}/node.exe"
  )

  local candidate
  for candidate in "${direct_candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  find "$search_root" -maxdepth 4 -type f \( -path '*/bin/node' -o -name 'node.exe' -o -name 'node' \) | sort | head -n 1
}

appliance_prepare_bundled_node_runtime() {
  local install_root="$1"
  local dry_run="${2:-0}"
  local archive_path
  archive_path="$(appliance_find_bundled_node_archive "$install_root")"
  if [[ -z "$archive_path" ]]; then
    return 0
  fi

  local target_root="${install_root}/runtime/node"
  appliance_rm_rf "$target_root" "$dry_run"
  appliance_extract_archive "$archive_path" "$target_root" "$dry_run"

  if [[ "$dry_run" == "1" ]]; then
    printf '%s\n' "${target_root}/bin/node"
    return 0
  fi

  appliance_find_node_executable "$target_root"
}

appliance_install_bundle_payload() {
  local bundle_root="$1"
  local install_root="$2"
  local dry_run="${3:-0}"

  appliance_mkdir "$install_root" "$dry_run"
  appliance_replace_tree "${bundle_root}/app" "${install_root}/app" "$dry_run"
  appliance_replace_tree "${bundle_root}/deployment" "${install_root}/deployment" "$dry_run"
  appliance_copy_if_exists "${bundle_root}/runtime" "${install_root}/runtime" "$dry_run"
  appliance_copy_if_exists "${bundle_root}/images" "${install_root}/images" "$dry_run"

  if [[ -f "${bundle_root}/appliance-manifest.json" ]]; then
    appliance_copy_file "${bundle_root}/appliance-manifest.json" "${install_root}/appliance-manifest.json" "$dry_run"
  fi
  if [[ -f "${bundle_root}/README.md" ]]; then
    appliance_copy_file "${bundle_root}/README.md" "${install_root}/README-appliance-bundle.md" "$dry_run"
  fi
}

appliance_mark_scripts_executable() {
  local target_root="$1"
  local dry_run="${2:-0}"
  local scripts_dir="${target_root}/deployment/appliance/linux"
  if [[ ! -d "$scripts_dir" ]]; then
    return 0
  fi

  if [[ "$dry_run" == "1" ]]; then
    appliance_log "chmod 0755 ${scripts_dir}/*.sh"
    return 0
  fi

  find "$scripts_dir" -maxdepth 1 -type f -name '*.sh' -exec chmod 0755 {} +
}

appliance_run_systemctl() {
  local dry_run="$1"
  shift
  if [[ "$dry_run" == "1" ]]; then
    appliance_log "systemctl $*"
    return 0
  fi

  systemctl "$@"
}

appliance_systemctl_available() {
  command -v systemctl >/dev/null 2>&1
}

appliance_check_runtime_dependencies() {
  local install_root="$1"
  if [[ ! -d "${install_root}/app/node_modules" ]]; then
    appliance_warn "app/node_modules is missing. Make sure the appliance bundle includes dependencies or the host can provide them offline."
  fi

  if [[ -f "${install_root}/runtime/appliance-node-archive.tar.gz" || -f "${install_root}/runtime/appliance-node-archive.tgz" || -f "${install_root}/runtime/appliance-node-archive.zip" || -f "${install_root}/runtime/appliance-node-archive.tar" ]]; then
    appliance_log "Detected bundled Node runtime archive under ${install_root}/runtime."
  fi
}
