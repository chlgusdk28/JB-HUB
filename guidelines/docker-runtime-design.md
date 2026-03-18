# Docker Runtime Design

## Goal

Allow a user to upload a prebuilt Docker image archive to a project and have the system:

1. store the archive under the project,
2. load the image into the local Docker engine,
3. run a container immediately,
4. expose logs and lifecycle controls,
5. enforce project-scoped ownership.

This is intentionally an internal, single-host runtime. It is not a full registry or a cluster scheduler.

## Current Scope

Implemented:

- Project-scoped Docker image archive upload
- Multi-image archive support (frontend + backend sidecars in one bundle)
- Optional `.env` and `docker-compose.yml` companion file upload
- `docker load` on upload
- Automatic `docker run` after a successful load
- Per-project Docker summary endpoint
- Deployment logs
- Start, stop, restart, and remove actions
- Uploader/project-author permission checks
- Automatic host port allocation
- Cleanup of Docker containers and upload artifacts when a project or image is removed

Out of scope for this version:

- Building from `Dockerfile` inside JB-Hub itself
- Multi-host runners
- Private registry sync
- Resource quotas
- Reverse proxy / custom domains
- Real member RBAC backed by a user table

## Runtime Model

The runtime is attached to a project, not to a global workspace.

- A project can have many uploaded Docker images.
- Each uploaded image belongs to one uploader.
- Each uploaded image can have one or more deployments over time.
- A deployment maps to one Docker container on the local engine.

This keeps the model simple enough for an internal Portainer-like flow while preserving ownership boundaries.

If a team builds frontend and backend images separately, they can still upload them together by creating a single tar or tar.gz bundle outside JB-Hub. This repository now includes `scripts/build-docker-bundle.mjs` for that packaging step.

## Identity And Permissions

Current identity source:

- The frontend sends `x-jb-user-name`.
- The backend treats that string as the acting user name.

Current rules:

- Upload: requires a non-empty actor name.
- Manage image/deployment: allowed for the original uploader or the project author.
- Read summary: allowed to any project viewer, but `canManage` is calculated per item.

Important limitation:

- This is not strong authentication for regular users yet.
- The correct next step is to replace `x-jb-user-name` with a real member session/JWT and a project membership table.

## Data Model

### `docker_images`

Stores image archive metadata and load results.

Key fields:

- `project_id`
- `uploader_name`
- `original_file_name`
- `tar_path`
- `image_name`
- `image_tag`
- `image_reference`
- `image_id`
- `size_bytes`
- `layers`
- `architecture`
- `exposed_ports`
- `load_status`
- `load_output`
- `load_error`

### `docker_deployments`

Stores runtime state for containers created from uploaded images.

Key fields:

- `project_id`
- `image_id`
- `uploader_name`
- `container_name`
- `container_id`
- `status`
- `host_port`
- `container_port`
- `endpoint_url`
- `run_output`
- `error_message`
- `started_at`
- `stopped_at`

## File Layout

Docker archives are stored outside the DB:

- `docker-uploads/projects/<projectId>/<uploader>/...tar`

This keeps MySQL from carrying large binary payloads and allows direct cleanup with filesystem operations.

## API Shape

Project-scoped routes:

- `GET /api/v1/projects/:id/docker`
- `POST /api/v1/projects/:id/docker/images`
- `DELETE /api/v1/projects/:id/docker/images/:imageId`
- `GET /api/v1/projects/:id/docker/deployments/:deploymentId/logs`
- `POST /api/v1/projects/:id/docker/deployments/:deploymentId/start`
- `POST /api/v1/projects/:id/docker/deployments/:deploymentId/stop`
- `POST /api/v1/projects/:id/docker/deployments/:deploymentId/restart`

## Upload Flow

1. Validate project and acting user.
2. Accept multipart upload to a temporary file.
3. Move the archive into the project upload directory.
4. Read `manifest.json` from the tar to capture repo tags and layer count.
5. Insert an image record with `uploaded` state.
6. Run `docker load -i <tar>`.
7. Inspect the loaded images and choose a primary exposed image.
8. Update the image record to `loaded`.
9. Insert a deployment record in `creating` state.
10. Create a dedicated Docker network for the deployment bundle.
11. Run sidecar containers first, then the primary exposed container.
12. Inspect the containers and persist runtime metadata.
13. Return updated project Docker summary.

## Port Allocation

Rule set:

- If the image does not expose a port, no host port is bound.
- If the user requests `preferredHostPort` and it is free, use it.
- Otherwise allocate from `46000-48999`.
- If the range is exhausted, fall back to an OS-assigned free port probe.

This keeps auto-assigned runtime ports away from common service ports.

## Docker Labels

Each managed container receives labels:

- `jb.hub.projectId`
- `jb.hub.imageRecordId`
- `jb.hub.deploymentId`
- `jb.hub.owner`

Networks created for multi-image bundles also receive the same project/image/deployment labels.

These labels are critical for cleanup and orphan recovery.

## Failure Handling

Protections in the current implementation:

- Docker uploads bypass the global 2 MB request limiter and use their own large-file path.
- Failed `docker load` updates the image record to `load_failed`.
- If `docker run` fails after a container id is created, the container is removed to avoid zombies.
- Removing an image record also removes containers by deployment row and by Docker label.
- Project deletion calls Docker cleanup before deleting the project row.
- Image removal ignores "image is being used by running container" conflicts so shared engine images do not block project cleanup.

## Frontend Model

The project detail page exposes a dedicated Docker tab.

Current UX:

- Archive upload with progress
- Optional `.env` / `compose` companion file upload
- Full-screen blocking overlay during upload/deploy
- Per-image deployment cards
- Start/stop/restart/remove actions
- Logs panel with bundle container aggregation
- Visibility of uploader, ports, and runtime status

## Operational Limits

This implementation is appropriate for:

- internal environments,
- a single Docker host,
- trusted or semi-trusted users,
- project-level runtime previews.

It is not enough yet for hostile multi-tenant workloads because:

- all containers run on the same engine,
- uploads are still large local files,
- user auth is weak for non-admins,
- no CPU/memory/network quotas are enforced,
- no worker queue isolates long-running operations from the API process.

## Recommended Next Steps

1. Replace `x-jb-user-name` with real user auth and project membership checks.
2. Move `docker load` / `docker run` work into a job queue worker.
3. Add CPU/memory/storage limits per deployment.
4. Add health checks and deployment readiness states.
5. Support `Dockerfile` build flow in addition to tar upload.
6. Add registry push/pull integration.
7. Add reverse proxy and friendly per-deployment URLs.
