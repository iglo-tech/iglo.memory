# Project conventions

- Use Bun for runtime APIs, package management, tests and TypeScript scripts.
  Prefer `Bun.file`, `Bun.write`, `Bun.spawn` and `Bun.CryptoHasher` where they
  provide the needed operation. Use global `crypto.randomUUID()` for UUIDs.
- Keep `node:fs` only where OS metadata, directories, file-descriptor flags,
  synchronous validated reads or atomic rename are required. Do not replace
  exclusive creation, no-follow checks or atomic publication with plain writes.
  `node:path` and `node:os` remain available for path and OS operations.
- All project module imports must use `@/`, mapped to the project root in
  `tsconfig.json`. No relative imports, re-exports or dynamic imports. Built-in
  modules and external packages retain their normal module specifiers. Use ES
  imports except `require('@/dist/lock.node')`: Bun requires it for Node-API
  addons. Oxlint permits only that exact alias as a `require` import.
- Run `bun run lint` and `bun run format:check`; use `bun run format` to format.
  `sh scripts/check.sh` runs lint, formatting, tests and strict typechecking.
- Keep durable decisions and reproduction instructions in `docs/`. Keep run
  logs and task state outside tracked project files; do not commit `.ai/work`.
