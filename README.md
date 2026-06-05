# Agent Analytics Monorepo

Turborepo monorepo for AI citation analytics.

## Packages

| Package | Description |
|---------|-------------|
| [`@usenotra/agent-analytics`](./packages/agent-analytics) | SDK for tracking AI agent citations in Upstash Redis |

## Apps

| App | Description |
|-----|-------------|
| [`dashboard`](./apps/dashboard) | Next.js dashboard for viewing agent analytics |

## Development

```bash
bun install
bun run build
bun run dev
```

Run a single workspace:

```bash
bun run dev --filter dashboard
bun run test --filter @usenotra/agent-analytics
```
