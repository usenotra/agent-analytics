# @upstash/agent-analytics

AI citation analytics for Upstash Redis, built directly on the Redis
[Search](https://upstash.com/docs/redis/search) extension — no
`@upstash/core-analytics` dependency.

## How it works

Every citation is bucketed by the hour and by its dimensions. A single Redis
hash holds the counter for one combination of dimensions in one hour:

```
key:   <prefix>:event:<data-hash>:<hourInt>
value: { count, hourInt, provider, citedUrl, sourceUrl?, country? }
```

- **`data-hash`** is derived from the event's dimensions. It is
  order-independent: `record({ provider, citedUrl })` and
  `record({ citedUrl, provider })` map to the same key.
- **`hourInt`** is an integer hour bucket. The hour is never exposed in the
  public API — every method takes and returns `Date`.
- Ingestion runs a small Lua script: it `HINCRBY`s the `count` field, and only
  the first time the counter is created does it write the immutable metadata
  and set the expiry (28 days by default, configurable).
- A Redis Search index over these hashes (with `count` and `hourInt` as numeric
  fields) powers the aggregations.

## Tracking

```ts
import { AgentAnalytics } from "@upstash/agent-analytics";
import { redis } from "./redis";

const analytics = new AgentAnalytics({ redis });

// From a Fetch/NextRequest — provider, citedUrl, sourceUrl and country are
// inferred from the request:
const { pending } = analytics.track(request);
await pending;

// Or record dimensions directly (time defaults to now):
await analytics.record({ provider: "chatgpt", citedUrl: "/pricing" });
```

### Next.js middleware

```ts
// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { AgentAnalytics } from "@upstash/agent-analytics";

const analytics = AgentAnalytics.fromEnv();

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pending } = analytics.track(req);
  res.waitUntil?.(pending);
  return res;
}
```

`track()` never throws; any failure is swallowed and surfaced through the
returned `pending` promise.

## Analytics

The read side lives under `.query`. Both queries take a `{ since, until? }`
window of `Date`s (`until` defaults to now). They are designed for windows from
24 hours up to 7 days.

```ts
const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

// Sum of citations grouped by one dimension. The field is type-safe.
await analytics.query.aggregateBy("provider", { since });
// -> { chatgpt: 12, claude: 7, perplexity: 3 }

await analytics.query.aggregateBy("citedUrl", { since });
// -> { "/pricing": 9, "/blog": 13 }

// Hourly time series, grouped by provider (default). One gap-filled bucket per
// hour in the window, sorted ascending — ready to chart.
await analytics.query.timeseries({ since });
// -> [{ time: Date, values: { chatgpt: 2, claude: 0 } }, ...]
```

### Setup & the search index

The queries above issue a single search request against a cheap local index
reference; they assume the index already exists and throw `IndexNotFoundError`
if it doesn't. Create it once, at setup (it's idempotent):

```ts
await analytics.query.getIndex(); // creates the search index if missing
```

Indexing is then asynchronous, and the queries read whatever has been indexed
so far — they do **not** wait. When you need a read to reflect events you just
recorded, call `analytics.query.waitIndexing()` first. `dropIndex()` removes the
index (the event hashes are left untouched).

## Configuration

```ts
new AgentAnalytics({
  redis,
  prefix: "@upstash/agent-analytics", // key namespace (default)
  retention: "28d",                   // hour-bucket TTL (default); also accepts seconds
  indexName: "...",                   // search index name (defaults to one derived from prefix)
});
```
