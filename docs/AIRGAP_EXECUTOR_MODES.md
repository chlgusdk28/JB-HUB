# Air-gapped Build Executor Modes

`server/airgap-builds.js` supports three execution styles.

## 1. Mock mode

Default mode for local development and UI testing.

```env
AIRGAP_BUILD_EXECUTOR_MODE=mock
AIRGAP_SCAN_MODE=mock
```

Behavior:

- simulates build status transitions
- writes structured build logs
- applies Dockerfile policy checks
- generates mock scan results and image digests

## 2. Shell executor mode

Use when the build host already has internal tooling available and you want the worker to call it directly.

```env
AIRGAP_BUILD_EXECUTOR_MODE=shell
AIRGAP_BUILD_EXECUTOR_COMMAND=["/usr/local/bin/buildctl-wrapper","--context","{context}","--dockerfile","{dockerfile}","--destination","{destination}"]
AIRGAP_SCAN_MODE=shell
AIRGAP_SCAN_COMMAND=["trivy","image","--skip-db-update","--severity","HIGH,CRITICAL","{destination}"]
AIRGAP_INSPECT_COMMAND=["docker","image","inspect","{destination}"]
AIRGAP_PUSH_COMMAND=[]
AIRGAP_BUILD_TIMEOUT_MS=1800000
AIRGAP_SCAN_TIMEOUT_MS=600000
```

Available placeholders:

- `{build_id}`
- `{context}` or `{context_root}`
- `{upload_root}`
- `{dockerfile}`
- `{dockerfile_rel}`
- `{destination}`
- `{image}` or `{image_reference}`
- `{image_name}`
- `{tag}`
- `{registry_mirror}`
- `{internal_registry}`
- `{platform}`
- `{build_args}`
- `{build_args_docker}`
- `{build_args_kaniko}`
- `{requester}`

Notes:

- `AIRGAP_BUILD_EXECUTOR_COMMAND` is required in `shell` mode.
- `AIRGAP_SCAN_COMMAND` is required when `AIRGAP_SCAN_MODE=shell`.
- a non-zero scan exit code is treated as policy block and produces `PUSH_BLOCKED`.
- `AIRGAP_PUSH_COMMAND` is optional; omit it when the build command already pushes.

## 3. Kaniko container mode

Use when the worker host can run a container runtime locally and you want the system to launch Kaniko directly.

```env
AIRGAP_BUILD_EXECUTOR_MODE=kaniko-container
AIRGAP_KANIKO_RUNTIME_BIN=docker
AIRGAP_KANIKO_IMAGE=registry.internal.bank.co.kr/build/kaniko-executor:latest
AIRGAP_KANIKO_DOCKER_CONFIG_DIR=/etc/airgap-kaniko/docker-config
AIRGAP_KANIKO_CACHE_REPO=registry.internal.bank.co.kr/cache/kaniko
AIRGAP_INTERNAL_REGISTRY_MIRROR=registry-mirror.internal.bank.co.kr
AIRGAP_INTERNAL_REGISTRY=registry.internal.bank.co.kr
AIRGAP_SCAN_MODE=shell
AIRGAP_SCAN_COMMAND=["trivy","image","--skip-db-update","--severity","HIGH,CRITICAL","{destination}"]
```

Behavior:

- mounts the extracted build context into the Kaniko container
- passes `--destination`, `--dockerfile`, `--context`, registry mirror, cache, and build args
- expects the Kaniko image to push directly to the internal registry

## Operational notes

- cancellation sends `SIGTERM` to the active child process
- build logs are stored in `.runtime/storage/airgap-builds/logs`
- build state is stored in `.runtime/storage/airgap-builds/state.json`
- upload contexts are stored in `.runtime/storage/airgap-builds/uploads`

## Deployment wiring

The same variables are exposed in these repository templates:

- `.env.example`
- `deployment/appliance/linux/jbhub-appliance.env.example`
- `docker-compose.finance.yml`

The appliance bundle also ships example wrapper scripts in `deployment/appliance/linux/`:

- `airgap-build-wrapper.sh`
- `airgap-scan-wrapper.sh`
- `airgap-inspect-wrapper.sh`
- `airgap-push-wrapper.sh`

Recommended rollout order:

1. start with `AIRGAP_BUILD_EXECUTOR_MODE=mock` and verify UI, queue, audit, and retry flows
2. switch to `shell` mode once the build host exposes approved internal wrapper commands
3. switch to `kaniko-container` when the host can launch the internal Kaniko image with registry credentials

For `kaniko-container` mode, make sure the worker host provides:

- a local container runtime such as `docker` or `nerdctl`
- registry credentials at `AIRGAP_KANIKO_DOCKER_CONFIG_DIR`
- network access only to approved internal registry and mirror endpoints

## Appliance shell-wrapper example

If you prefer `AIRGAP_BUILD_EXECUTOR_MODE=shell`, you can point the worker to the shipped Linux wrappers after copying them to an operational path such as `/opt/jbhub/deployment/appliance/linux/`.

```env
AIRGAP_BUILD_EXECUTOR_MODE=shell
AIRGAP_SCAN_MODE=shell
AIRGAP_BUILD_EXECUTOR_COMMAND=["/opt/jbhub/deployment/appliance/linux/airgap-build-wrapper.sh","--context","{context}","--dockerfile","{dockerfile}","--destination","{destination}","--platform","{platform}","--registry-mirror","{registry_mirror}","--internal-registry","{internal_registry}","--build-args","{build_args_kaniko}"]
AIRGAP_SCAN_COMMAND=["/opt/jbhub/deployment/appliance/linux/airgap-scan-wrapper.sh","--image","{destination}"]
AIRGAP_INSPECT_COMMAND=["/opt/jbhub/deployment/appliance/linux/airgap-inspect-wrapper.sh","--image","{destination}"]
AIRGAP_PUSH_COMMAND=["/opt/jbhub/deployment/appliance/linux/airgap-push-wrapper.sh","--image","{destination}"]
```

Wrapper behavior:

- `airgap-build-wrapper.sh` launches the configured Kaniko image through a local docker/nerdctl-compatible runtime
- `airgap-scan-wrapper.sh` runs Trivy in offline JSON mode, prints severity totals, and exits non-zero when blocked severities are present
- `airgap-inspect-wrapper.sh` returns container runtime JSON that the API can parse for image metadata
- `airgap-push-wrapper.sh` is optional and useful only when the selected build command does not already push
