# Project Structure

Start by splitting the repository into `source`, `runtime`, and `docs`.

## 1. Source code

```text
src/
  app/
    components/      # screens, feature shells, reusable sections
    lib/             # API clients and browser-side helpers
    hooks/           # reusable React hooks
    constants/       # fixed labels and filter data
    data/            # frontend seed data
    design-system/   # reusable UI primitives
server/
  index.js           # main Express + MySQL server
  sqlite-api.js      # SQLite local API mode
  mock-api.js        # in-memory mock API mode
  runtime-paths.js   # shared runtime directory layout
  runtime-seeds/     # tracked sample files copied into runtime on first run
scripts/
  dev-stack.mjs      # start web + API together
  run-vite.mjs       # frontend wrapper
  run-api.mjs        # backend wrapper
  test-api.mjs       # API checks
```

## 2. Generated runtime files

Everything created while running locally is grouped under `.runtime/`:

```text
.runtime/
  dev-*.log
  storage/
    data/            # SQLite db files
    project-files/   # uploaded project files
    upload-temp/     # temporary upload files
    backup/          # local backup artifacts
```

This keeps the repository root focused on code instead of local state.

## 3. Reading order

If you are new to the project, open files in this order:

1. `README.md`
2. `src/app/App.tsx`
3. `src/app/README.md`
4. `server/README.md`
5. `scripts/README.md`

## 4. Quick map

- Want the main app entry: `src/app/App.tsx`
- Want page-level UI: `src/app/components/`
- Want frontend API calls: `src/app/lib/`
- Want backend routes: `server/index.js`
- Want local SQLite mode: `server/sqlite-api.js`
- Want runtime file layout: `server/runtime-paths.js`
