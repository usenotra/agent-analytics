# Agent instructions

## Cursor Cloud specific instructions

This is a **Bun + Turborepo** monorepo.

### Layout

- `packages/agent-analytics` — SDK (`@usenotra/agent-analytics`), built with tsup
- `apps/dashboard` — Next.js 15 dashboard on port **3000**

### Common commands

See root `package.json` and `README.md`:

- `bun install` — install all workspace dependencies
- `bun run build` — build SDK then dashboard (turbo `^build` dependency)
- `bun run dev --filter dashboard` — start the dashboard dev server
- `bun run test --filter @usenotra/agent-analytics` — SDK tests (requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for integration tests)
- `bun run typecheck` — TypeScript across workspaces

### Notes

- Bun must be on `PATH` (`~/.bun/bin`).
- Integration tests in `packages/agent-analytics` need Upstash Redis env vars; unit tests in `hash.test.ts`, `request.test.ts`, etc. run without Redis.
- The dashboard shows **demo data** when Redis env vars are unset; set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `apps/dashboard/.env.local` for live analytics.
