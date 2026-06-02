import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Redis } from "@upstash/redis";

import { AgentAnalytics, IndexNotFoundError } from "./analytics.ts";
import { dataHash, dimensionPairs } from "./hash.ts";
import { dateToHourInt, hourIntToDate, HOUR_MS } from "./time.ts";
import type { TrackedEvent } from "./types.ts";

const redis = Redis.fromEnv();

/**
 * Test subclass exposing the protected key helpers so tests can locate the
 * exact hashes the SDK writes.
 */
class TestableAnalytics extends AgentAnalytics {
  public override get keyPrefix(): string {
    return super.keyPrefix;
  }
  public override eventKey(hash: string, hour: number): string {
    return super.eventKey(hash, hour);
  }
}

/** A unique prefix per instance so concurrent runs never collide. */
function uniquePrefix(): string {
  return `test:agent-analytics:${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function scanKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, { match: `${prefix}*`, count: 200 });
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

async function cleanup(analytics: TestableAnalytics): Promise<void> {
  const keys = await scanKeys(analytics.keyPrefix);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await analytics.query.dropIndex();
}

/** The key `track()` would write for a given event + time. */
function keyFor(analytics: TestableAnalytics, event: TrackedEvent, time: Date): string {
  return analytics.eventKey(dataHash(dimensionPairs(event as Record<string, string>)), dateToHourInt(time));
}

/** Track one event and await the write, returning the counter's new value. */
function trackOne(analytics: TestableAnalytics, event: TrackedEvent, time?: Date): Promise<unknown> {
  return analytics.track(event, time).pending;
}

describe("ingestion", () => {
  const analytics = new TestableAnalytics({ redis, prefix: uniquePrefix(), retention: "28d" });
  const now = new Date();

  afterAll(() => cleanup(analytics));

  test("first hit creates the counter, stores metadata, and sets the TTL", async () => {
    const event: TrackedEvent = { provider: "chatgpt", path: "/pricing" };
    const key = keyFor(analytics, event, now);

    expect(await trackOne(analytics, event, now)).toBe(1);

    const hash = (await redis.hgetall(key)) as Record<string, unknown>;
    expect(Number(hash.count)).toBe(1);
    expect(Number(hash.hour)).toBe(dateToHourInt(now));
    expect(String(hash.provider)).toBe("chatgpt");
    expect(String(hash.path)).toBe("/pricing");

    const ttl = await redis.ttl(key);
    expect(ttl).toBeLessThanOrEqual(28 * 24 * 60 * 60);
    expect(ttl).toBeGreaterThan(28 * 24 * 60 * 60 - 120);
  });

  test("subsequent hits only bump the counter; metadata is untouched", async () => {
    const event: TrackedEvent = { provider: "gemini", path: "/docs" };
    const key = keyFor(analytics, event, now);

    expect(await trackOne(analytics, event, now)).toBe(1);
    expect(await trackOne(analytics, event, now)).toBe(2);
    expect(await trackOne(analytics, event, now)).toBe(3);

    const hash = (await redis.hgetall(key)) as Record<string, unknown>;
    expect(Number(hash.count)).toBe(3);
    expect(String(hash.provider)).toBe("gemini");
    expect(String(hash.path)).toBe("/docs");
  });

  test("dimension order does not matter: same counter is incremented", async () => {
    const time = new Date(now.getTime() - 4 * HOUR_MS);
    const a: TrackedEvent = { provider: "claude", path: "/blog", country: "US" };
    const b: TrackedEvent = { country: "US", path: "/blog", provider: "claude" } as TrackedEvent;

    // Both spellings resolve to the same key.
    expect(keyFor(analytics, a, time)).toBe(keyFor(analytics, b, time));

    expect(await trackOne(analytics, a, time)).toBe(1);
    expect(await trackOne(analytics, b, time)).toBe(2);

    const hash = (await redis.hgetall(keyFor(analytics, a, time))) as Record<string, unknown>;
    expect(Number(hash.count)).toBe(2);
    expect(String(hash.country)).toBe("US");
  });

  test("different dimensions and different hours occupy different keys", async () => {
    const hourA = new Date(now.getTime() - 10 * HOUR_MS);
    const hourB = new Date(now.getTime() - 11 * HOUR_MS);

    await trackOne(analytics, { provider: "perplexity", path: "/x" }, hourA);
    await trackOne(analytics, { provider: "perplexity", path: "/y" }, hourA); // different dimension
    await trackOne(analytics, { provider: "perplexity", path: "/x" }, hourB); // different hour

    const keys = await scanKeys(analytics.keyPrefix);
    const distinct = new Set([
      keyFor(analytics, { provider: "perplexity", path: "/x" }, hourA),
      keyFor(analytics, { provider: "perplexity", path: "/y" }, hourA),
      keyFor(analytics, { provider: "perplexity", path: "/x" }, hourB),
    ]);
    expect(distinct.size).toBe(3);
    for (const key of distinct) {
      expect(keys).toContain(key);
    }
  });

  test("track(Request) infers dimensions and resolves pending", async () => {
    const req = new Request("https://upstash.com/blog", {
      headers: { "user-agent": "PerplexityBot/1.0", referer: "https://www.perplexity.ai/" },
    });

    const { success, pending } = analytics.track(req);
    expect(success).toBe(true);
    await pending;

    // provider inferred as perplexity, path normalized from the request URL.
    // Locate the hash by scanning rather than recomputing the (time-dependent) key.
    const keys = await scanKeys(analytics.keyPrefix);
    const hashes = await Promise.all(
      keys.map((key) => redis.hgetall(key) as Promise<Record<string, unknown>>),
    );
    const tracked = hashes.find(
      (h) => h && String(h.provider) === "perplexity" && String(h.path) === "https://upstash.com/blog",
    );
    expect(tracked).toBeDefined();
    expect(String(tracked!.sourceUrl)).toBe("https://www.perplexity.ai/");
  });
});

describe("analytics aggregations", () => {
  const analytics = new TestableAnalytics({ redis, prefix: uniquePrefix() });
  // Anchor every query to a fixed instant so an hour rollover mid-test cannot
  // change which buckets fall inside the window.
  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR_MS);

  beforeAll(async () => {
    // Within the last 24h.
    await trackOne(analytics, { provider: "chatgpt", path: "/a" }, at(0));
    await trackOne(analytics, { provider: "chatgpt", path: "/a" }, at(0));
    await trackOne(analytics, { provider: "chatgpt", path: "/a" }, at(0));
    await trackOne(analytics, { provider: "claude", path: "/a" }, at(0));
    await trackOne(analytics, { provider: "chatgpt", path: "/b" }, at(1));
    await trackOne(analytics, { provider: "chatgpt", path: "/b" }, at(1));
    await trackOne(analytics, { provider: "perplexity", path: "/b" }, at(2));
    // Older than 24h but within 7d.
    await trackOne(analytics, { provider: "claude", path: "/a" }, at(30));
    await trackOne(analytics, { provider: "claude", path: "/a" }, at(30));

    // The index must be created explicitly (queries assume it exists), and
    // queries no longer wait implicitly — block until it is caught up.
    await analytics.query.getIndex();
    await analytics.query.waitIndexing();
  });

  afterAll(() => cleanup(analytics));

  test("aggregateBy(provider) over the last 24h sums counters and excludes older buckets", async () => {
    const result = await analytics.query.aggregateBy({ field: "provider", since: at(23), until: now });
    expect(result).toEqual({ chatgpt: 5, claude: 1, perplexity: 1 });
  });

  test("aggregateBy(provider) over the last 7d includes the older bucket", async () => {
    const result = await analytics.query.aggregateBy({ field: "provider", since: at(24 * 7), until: now });
    expect(result).toEqual({ chatgpt: 5, claude: 3, perplexity: 1 });
  });

  test("aggregateBy(path) groups by page", async () => {
    const result = await analytics.query.aggregateBy({ field: "path", since: at(23), until: now });
    expect(result).toEqual({ "/a": 4, "/b": 3 });
  });

  test("timeseries(provider) returns one gap-filled bucket per hour, grouped by provider", async () => {
    const series = await analytics.query.timeseries({ since: at(3), until: now, groupBy: "provider" });

    // since=at(3) .. until=now -> hours [now-3 .. now] inclusive = 4 buckets.
    expect(series).toHaveLength(4);

    // Every bucket carries the same group keys (missing -> 0).
    for (const bucket of series) {
      expect(Object.keys(bucket.values).sort()).toEqual(["chatgpt", "claude", "perplexity"]);
    }

    const bucketAt = (hoursAgo: number) => {
      const time = hourIntToDate(dateToHourInt(at(hoursAgo))).getTime();
      return series.find((b) => b.time.getTime() === time)!;
    };

    expect(bucketAt(0).values).toEqual({ chatgpt: 3, claude: 1, perplexity: 0 });
    expect(bucketAt(1).values).toEqual({ chatgpt: 2, claude: 0, perplexity: 0 });
    expect(bucketAt(2).values).toEqual({ chatgpt: 0, claude: 0, perplexity: 1 });
    expect(bucketAt(3).values).toEqual({ chatgpt: 0, claude: 0, perplexity: 0 });
  });
});

describe("querying without an index", () => {
  // A prefix whose index is never created via getIndex().
  const analytics = new TestableAnalytics({ redis, prefix: uniquePrefix() });

  afterAll(() => cleanup(analytics));

  test("aggregateBy throws IndexNotFoundError when the index does not exist", async () => {
    const promise = analytics.query.aggregateBy({ field: "provider", since: new Date(Date.now() - HOUR_MS) });
    await expect(promise).rejects.toBeInstanceOf(IndexNotFoundError);
    await expect(promise).rejects.toThrow(/Search index ".*" does not exist\. Call query\.getIndex\(\)/);
  });

  test("timeseries throws IndexNotFoundError when the index does not exist", async () => {
    const promise = analytics.query.timeseries({ since: new Date(Date.now() - HOUR_MS) });
    await expect(promise).rejects.toBeInstanceOf(IndexNotFoundError);
  });
});
