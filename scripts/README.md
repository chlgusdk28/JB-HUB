# Scripts

This folder holds developer-facing entry points.

## Most useful scripts

- `dev-stack.mjs`: start frontend and API together
- `run-vite.mjs`: frontend wrapper for `vite`
- `run-api.mjs`: backend wrapper
- `test-api.mjs`: API validation
- `smoke-web.mjs`: web smoke checks
- `reset-signup-platform-data.mjs`: reset local project/signup data

## Reading tip

Start with the small entry scripts above before opening larger server files.

## Why these exist

These wrappers keep local startup rules in one place, so the root `package.json` stays short and the repo is easier to scan.
