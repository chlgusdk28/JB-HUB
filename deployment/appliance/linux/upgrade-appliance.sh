#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./appliance-common.sh
source "${SCRIPT_DIR}/appliance-common.sh"

usage() {
  cat <<'EOF'
Usage: upgrade-appliance.sh [options]

Options:
  --bundle-root PATH         Bundle root that contains app/ and deployment/
  --install-root PATH        Existing installation root (default: /opt/jbhub)
  --env-root PATH            Environment directory (default: /etc/jbhub)
  --service-root PATH        systemd unit directory (default: /etc/systemd/system)
  --service-name NAME        Service file name (default: jbhub-appliance.service)
  --backup-root PATH         Backup directory (default: <install-root>/backups)
  --user NAME                Service user (default: jbhub)
  --group NAME               Service group (default: jbhub)
  --node-bin PATH            Node.js binary path for ExecStart
  --skip-user-setup          Do not create user/group or chown files
  --skip-systemd             Do not run systemctl stop/daemon-reload/restart
  --skip-start               Do not restart the service after upgrade
  --force-env-example        Overwrite the target env file with the shipped example
  --dry-run                  Print intended actions without mutating the host
  -h, --help                 Show this help
EOF
}

bundle_root="$(appliance_default_bundle_root)"
install_root="/opt/jbhub"
env_root="/etc/jbhub"
service_root="/etc/systemd/system"
service_name="jbhub-appliance.service"
backup_root=""
app_user="jbhub"
app_group="jbhub"
node_bin=""
skip_user_setup=0
skip_systemd=0
skip_start=0
force_env_example=0
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-root)
      bundle_root="${2-}"
      shift 2
      ;;
    --install-root)
      install_root="${2-}"
      shift 2
      ;;
    --env-root)
      env_root="${2-}"
      shift 2
      ;;
    --service-root)
      service_root="${2-}"
      shift 2
      ;;
    --service-name)
      service_name="${2-}"
      shift 2
      ;;
    --backup-root)
      backup_root="${2-}"
      shift 2
      ;;
    --user)
      app_user="${2-}"
      shift 2
      ;;
    --group)
      app_group="${2-}"
      shift 2
      ;;
    --node-bin)
      node_bin="${2-}"
      shift 2
      ;;
    --skip-user-setup)
      skip_user_setup=1
      shift
      ;;
    --skip-systemd)
      skip_systemd=1
      shift
      ;;
    --skip-start)
      skip_start=1
      shift
      ;;
    --force-env-example)
      force_env_example=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      appliance_fail "Unknown argument: $1"
      ;;
  esac
done

bundle_root="$(cd "$bundle_root" && pwd)"
backup_root="${backup_root:-${install_root}/backups}"
env_file="${env_root}/jbhub-appliance.env"
service_file="${service_root}/${service_name}"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="${backup_root}/${timestamp}"

appliance_assert_root_or_dry_run "$dry_run" "$skip_user_setup" "$skip_systemd"
appliance_require_bundle_layout "$bundle_root"

if [[ ! -d "${install_root}/app" && "$dry_run" != "1" ]]; then
  appliance_fail "Existing installation not found at ${install_root}/app. Use install-appliance.sh for first-time deployment."
fi

appliance_log "Upgrading JB-HUB appliance from ${bundle_root}"
appliance_log "Install root: ${install_root}"
appliance_log "Backup root: ${backup_root}"
appliance_log "Backup dir: ${backup_dir}"

if [[ "$skip_systemd" == "1" ]]; then
  appliance_log 'Skipping systemd stop before upgrade.'
elif ! appliance_systemctl_available; then
  appliance_warn 'systemctl is unavailable on this host. Service stop was skipped.'
else
  appliance_run_systemctl "$dry_run" stop "$service_name"
fi

appliance_mkdir "$backup_dir" "$dry_run"
appliance_backup_path "${install_root}/app" "${backup_dir}/app" "$dry_run"
appliance_backup_path "${install_root}/deployment" "${backup_dir}/deployment" "$dry_run"
appliance_backup_path "${install_root}/runtime" "${backup_dir}/runtime" "$dry_run"
appliance_backup_path "${install_root}/images" "${backup_dir}/images" "$dry_run"
appliance_backup_path "${install_root}/appliance-manifest.json" "${backup_dir}/appliance-manifest.json" "$dry_run"
appliance_backup_path "${install_root}/README-appliance-bundle.md" "${backup_dir}/README-appliance-bundle.md" "$dry_run"
appliance_backup_path "$env_file" "${backup_dir}/jbhub-appliance.env" "$dry_run"
appliance_backup_path "$service_file" "${backup_dir}/${service_name}" "$dry_run"

appliance_setup_user_group "$app_user" "$app_group" "$dry_run" "$skip_user_setup"
appliance_mkdir "$env_root" "$dry_run"
appliance_install_bundle_payload "$bundle_root" "$install_root" "$dry_run"
appliance_mark_scripts_executable "$install_root" "$dry_run"
bundled_node_bin="$(appliance_prepare_bundled_node_runtime "$install_root" "$dry_run")"
node_bin="$(appliance_resolve_node_bin "$node_bin" "$bundled_node_bin")"
appliance_install_env_file "${bundle_root}/deployment/appliance/linux/jbhub-appliance.env.example" "$env_file" "$force_env_example" "$dry_run"
appliance_install_service_file "$service_file" "$install_root" "$env_file" "$node_bin" "$app_user" "$app_group" "$dry_run"
appliance_chown_path "$install_root" "$app_user" "$app_group" "$dry_run" "$skip_user_setup"
appliance_check_runtime_dependencies "$install_root"

if [[ "$skip_systemd" == "1" ]]; then
  appliance_log 'Skipping systemd restart.'
elif ! appliance_systemctl_available; then
  appliance_warn 'systemctl is unavailable on this host. Service restart was skipped.'
else
  appliance_run_systemctl "$dry_run" daemon-reload
  if [[ "$skip_start" == "1" ]]; then
    appliance_log 'Skipping service start.'
  else
    appliance_run_systemctl "$dry_run" restart "$service_name"
  fi
fi

appliance_log "Upgrade complete. Backup saved to ${backup_dir}"
