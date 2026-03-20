# Server Layout

Backend entry points are split by runtime mode:

- `index.js`: main Express server using MySQL
- `sqlite-api.js`: local SQLite mode
- `mock-api.js`: in-memory mock mode
- `runtime-paths.js`: shared local runtime directories
- `runtime-seeds/`: tracked sample files copied into `.runtime/` when needed

Support files:

- `signup-platform.js`: signup platform routes and schema helpers
- `site-content.js`: editable site content routes
- `tools-api.js`: tools endpoints
- `seed-projects.js`: local seed data

If you are trying to understand the backend quickly, start with:

1. `runtime-paths.js`
2. `index.js`
3. `sqlite-api.js`
