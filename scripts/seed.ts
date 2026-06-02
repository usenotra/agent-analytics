/**
 * Seed a Redis database with realistic AI-citation history.
 *
 * Run with credentials in the repo's .env (bun auto-loads it):
 *
 *   bun run seed
 *   AI_TRACKING_PREFIX="@upstash/ai-tracking" bun run seed
 *
 * It writes 30 days of hourly buckets with a diurnal + weekly rhythm, a gentle
 * upward trend, and — importantly — plenty of EMPTY buckets (quiet overnight
 * hours, random gaps, and a few multi-hour outages) so charts have to handle
 * holes in the series.
 *
 * For speed it writes the event hashes directly in the exact layout the SDK
 * uses (key + fields), reusing the SDK's own hashing/time helpers so the keys
 * are byte-for-byte what `record()` would have produced. It then creates the
 * search index through the public SDK and waits for indexing, so the data is
 * immediately queryable via `query.aggregateBy` / `query.timeseries`.
 */
import { Redis } from "@upstash/redis";

import { AgentAnalytics } from "../src/index.ts";
import { dataHash, dimensionPairs } from "../src/hash.ts";
import { dateToHourInt } from "../src/time.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAYS = 30;
const TOTAL_HOURS = DAYS * 24;
const TTL_SECONDS = 45 * 24 * 60 * 60; // outlive the 30d of history during a demo

const prefix = process.env.AI_TRACKING_PREFIX ?? "@upstash/ai-tracking";
const redis = Redis.fromEnv();
const analytics = new AgentAnalytics({ redis, prefix });

// Per-provider hourly baseline + how fast it grows toward "now".
const PROVIDERS = [
  { id: "chatgpt", base: 60, trend: 0.010 },
  { id: "claude", base: 40, trend: 0.004 },
  { id: "perplexity", base: 14, trend: 0.022 },
  { id: "gemini", base: 9, trend: 0.014 },
  { id: "copilot", base: 6, trend: 0.006 },
  { id: "other", base: 12, trend: 0.002 },
] as const;

const PAGES = ["/", "/blog/launch-week", "/docs/redis"] as const;
// How citations split across pages (sums to 1).
const PAGE_WEIGHTS = [0.5, 0.3, 0.2];

const noise = () => 0.8 + Math.random() * 0.4; // ±20%

/** The full Redis key for one (provider, page, hour), matching the SDK exactly. */
function eventKey(provider: string, citedUrl: string, hourInt: number): string {
  const hash = dataHash(dimensionPairs({ provider, citedUrl }));
  return `${prefix}:event:${hash}:${hourInt}`;
}

/** Hours that are deliberately left completely empty (no provider, no page). */
function buildEmptyHours(now: Date): Set<number> {
  const empty = new Set<number>();
  const nowHour = dateToHourInt(now);

  // A few multi-hour "outages" scattered through the month.
  const outages = [
    { startHoursAgo: 5, length: 1 }, // a hole inside the last 24h
    { startHoursAgo: 40, length: 6 },
    { startHoursAgo: 96, length: 4 },
    { startHoursAgo: 300, length: 9 },
    { startHoursAgo: 540, length: 5 },
  ];
  for (const { startHoursAgo, length } of outages) {
    for (let i = 0; i < length; i++) empty.add(nowHour - startHoursAgo - i);
  }
  return empty;
}

function diurnalFactor(hourOfDay: number): number {
  // Peaks early afternoon, troughs around 4am. Range ~[0.15, 1].
  return 0.15 + 0.85 * Math.max(0, Math.sin((Math.PI * (hourOfDay - 3)) / 18));
}

function weeklyFactor(dayOfWeek: number): number {
  return dayOfWeek === 0 || dayOfWeek === 6 ? 0.7 : 1; // quieter weekends
}

type Bucket = { key: string; provider: string; citedUrl: string; hourInt: number; count: number };

function generate(now: Date): Bucket[] {
  const nowHour = dateToHourInt(now);
  const emptyHours = buildEmptyHours(now);
  const buckets: Bucket[] = [];

  for (let hoursAgo = 0; hoursAgo < TOTAL_HOURS; hoursAgo++) {
    const hourInt = nowHour - hoursAgo;
    if (emptyHours.has(hourInt)) continue;

    const date = new Date(hourInt * HOUR_MS);
    const diurnal = diurnalFactor(date.getUTCHours());
    const weekly = weeklyFactor(date.getUTCDay());
    // 0 at the oldest hour, 1 at "now" — drives the upward trend.
    const age = (TOTAL_HOURS - hoursAgo) / TOTAL_HOURS;

    for (const provider of PROVIDERS) {
      const growth = 1 + age * provider.trend * TOTAL_HOURS;
      const hourly = provider.base * diurnal * weekly * growth * noise();

      // Split this provider's hourly volume across pages; low traffic naturally
      // produces empty (provider, page) cells, especially overnight.
      PAGES.forEach((citedUrl, pageIndex) => {
        const count = Math.round(hourly * PAGE_WEIGHTS[pageIndex]!);
        if (count <= 0) return;
        buckets.push({
          key: eventKey(provider.id, citedUrl, hourInt),
          provider: provider.id,
          citedUrl,
          hourInt,
          count,
        });
      });
    }
  }

  return buckets;
}

async function clearExisting(): Promise<number> {
  let cursor = "0";
  const stale: string[] = [];
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${prefix}:event:*`, count: 500 });
    cursor = next;
    stale.push(...keys);
  } while (cursor !== "0");

  for (let i = 0; i < stale.length; i += 500) {
    await redis.del(...stale.slice(i, i + 500));
  }
  return stale.length;
}

async function writeBuckets(buckets: Bucket[]): Promise<void> {
  const CHUNK = 250;
  for (let i = 0; i < buckets.length; i += CHUNK) {
    const pipeline = redis.pipeline();
    for (const b of buckets.slice(i, i + CHUNK)) {
      pipeline.hset(b.key, {
        count: b.count,
        hourInt: b.hourInt,
        provider: b.provider,
        citedUrl: b.citedUrl,
      });
      pipeline.expire(b.key, TTL_SECONDS);
    }
    await pipeline.exec();
  }
}

async function main(): Promise<void> {
  const now = new Date();

  const cleared = await clearExisting();
  console.log(`Cleared ${cleared} existing event keys.`);

  const buckets = generate(now);
  const populatedHours = new Set(buckets.map((b) => b.hourInt)).size;
  const totalCitations = buckets.reduce((sum, b) => sum + b.count, 0);
  console.log(
    `Generated ${buckets.length} event hashes across ${populatedHours}/${TOTAL_HOURS} hours ` +
      `(${TOTAL_HOURS - populatedHours} empty), ${totalCitations} citations total.`,
  );

  await writeBuckets(buckets);
  console.log("Wrote all buckets. Creating index + waiting for indexing...");

  await analytics.query.getIndex();
  await analytics.query.waitIndexing();

  // Sanity check through the public read API.
  const day = await analytics.query.aggregateBy({
    field: "provider",
    since: new Date(now.getTime() - 24 * HOUR_MS),
  });
  const week = await analytics.query.aggregateBy({
    field: "provider",
    since: new Date(now.getTime() - 7 * 24 * HOUR_MS),
  });
  console.log("Last 24h by provider:", day);
  console.log("Last 7d by provider:", week);
  console.log(`Done. Prefix: "${prefix}".`);
}

await main();
