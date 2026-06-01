# @upstash/agent-analytics

AI citation analytics for Upstash Redis, implemented the same way `@upstash/ratelimit` stores analytics.

The SDK wraps `@upstash/core-analytics` with:

- Redis sorted-set analytics buckets
- `window: "1h"`
- `retention: "90d"`
- table name `events`
- default prefix `@upstash/ai-tracking`
- a `pending` promise that middleware can pass to `waitUntil`

## Next.js middleware

```ts
import { AgentAnalytics } from "@upstash/agent-analytics";
import { redis } from "./redis";

const req = new Request("https://upstash.com/blog");

const analytics = new AgentAnalytics({ redis });
await analytics.track(req).pending;
```

```ts
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { AgentAnalytics } from "@upstash/agent-analytics";

const analytics = AgentAnalytics.fromEnv({
  prefix: "@upstash/ai-tracking",
});

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const { pending } = analytics.track(req);

  res.waitUntil?.(pending);
  return res;
}
```

## Direct analytics API

Use this in the dashboard or internal API routes.

```ts
import { Redis } from "@upstash/redis";
import { Analytics } from "@upstash/agent-analytics";

const analytics = new Analytics({
  redis: Redis.fromEnv(),
  prefix: "@upstash/ai-tracking",
});

// Who cited us since this cutoff timestamp?
const providers = await analytics.getUsage(Date.now() - 24 * 60 * 60 * 1000);

// Which pages were cited since this cutoff timestamp?
const pages = await analytics.getPages(Date.now() - 7 * 24 * 60 * 60 * 1000);

// Hourly chart buckets.
const overTime = await analytics.getUsageOverTime(24, "provider");
```

## Tracking

```ts
const { pending } = analytics.track(request);
```

`track()` accepts a standard Fetch `Request`, which also works with `NextRequest`. The SDK reads these fields from the request:

- `citedUrl`: `request.nextUrl.href` when present, otherwise `request.url`
- `sourceUrl`: `referer`/`referrer` header
- `userAgent`: `user-agent` header
- geo fields: `request.geo` on Vercel or `request.cf` on Cloudflare
- `ip`: `request.ip`, `x-forwarded-for`, or `x-real-ip`
- `provider`: inferred from referrer/user-agent, falling back to `other`

## Same pattern as ratelimit

`@upstash/ratelimit` exposes a small `Analytics` class that creates `@upstash/core-analytics` with hourly buckets, the `events` table, a Redis prefix, and 90 day retention. Its parent class records an event asynchronously and merges that promise into `response.pending`.

This package does the same thing. The parent `AgentAnalytics` class calls `Analytics.record()`, catches analytics failures, and returns `{ success: true, pending }`.
