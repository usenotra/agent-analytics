import { Redis as UpstashRedis } from "@upstash/redis";

import { parseDuration } from "./duration.ts";
import { dataHash, dimensionPairs } from "./hash.ts";
import { eventFromRequest } from "./request.ts";
import { INGEST_SCRIPT } from "./script.ts";
import { dateToHourInt, hourIntToDate } from "./time.ts";
import type {
  AgentAnalyticsConfig,
  DimensionKey,
  Redis,
  TimeRange,
  TimeseriesBucket,
  TrackedEvent,
  TrackResponse,
} from "./types.ts";

export const DEFAULT_PREFIX = "@upstash/agent-analytics";
export const DEFAULT_RETENTION = "28d";

/**
 * Flat schema of an event hash. `count` and `hourInt` are numeric so we can
 * range-filter and group on them; the dimensions are keywords so we can group
 * by their exact values.
 */
const EVENT_SCHEMA = {
  count: { type: "U64" as const, fast: true as const },
  hourInt: { type: "U64" as const, fast: true as const },
  provider: { type: "KEYWORD" as const },
  citedUrl: { type: "KEYWORD" as const },
  sourceUrl: { type: "KEYWORD" as const },
  country: { type: "KEYWORD" as const },
};

function resolveRange(range: TimeRange): { sinceHour: number; untilHour: number } {
  return {
    sinceHour: dateToHourInt(range.since),
    untilHour: dateToHourInt(range.until ?? new Date()),
  };
}

/**
 * The read side of agent analytics — everything powered by the Redis Search
 * index. Reached via {@link AgentAnalytics.query}.
 */
class AnalyticsQuery {
  private indexPromise?: ReturnType<Redis["search"]["createIndex"]>;

  public constructor(
    private readonly redis: Redis,
    private readonly keyPrefix: string,
    private readonly indexName: string,
  ) {}

  /**
   * Sum the counters in a time window, grouped by one dimension.
   *
   * @example
   * // Citations per provider over the last 24 hours
   * await analytics.query.aggregateBy("provider", { since: new Date(Date.now() - 24 * 3600_000) });
   * // -> { chatgpt: 12, claude: 7, perplexity: 3 }
   */
  public async aggregateBy(
    field: DimensionKey,
    range: TimeRange,
  ): Promise<Record<string, number>> {
    const index = await this.getIndex();
    await index.waitIndexing();

    const { sinceHour, untilHour } = resolveRange(range);
    const result = await index.aggregate({
      filter: { hourInt: { $gte: sinceHour, $lte: untilHour } },
      aggregations: {
        groups: {
          $terms: { field, size: 10_000 },
          $aggs: { total: { $sum: { field: "count" } } },
        },
      },
    });

    const counts: Record<string, number> = {};
    for (const bucket of result.groups.buckets) {
      counts[String(bucket.key)] = bucket.total.value;
    }
    return counts;
  }

  /**
   * Hourly time series of summed counters in a window, grouped by one
   * dimension (provider by default). Returns one bucket per hour in the range
   * (including empty hours), sorted ascending, so it is chart-ready.
   */
  public async timeseries(
    range: TimeRange,
    groupBy: DimensionKey = "provider",
  ): Promise<TimeseriesBucket[]> {
    const index = await this.getIndex();
    await index.waitIndexing();

    const { sinceHour, untilHour } = resolveRange(range);
    const result = await index.aggregate({
      filter: { hourInt: { $gte: sinceHour, $lte: untilHour } },
      aggregations: {
        byHour: {
          $histogram: { field: "hourInt", interval: 1 },
          $aggs: {
            byGroup: {
              $terms: { field: groupBy, size: 10_000 },
              $aggs: { total: { $sum: { field: "count" } } },
            },
          },
        },
      },
    });

    // Collect the populated hours and the full set of groups we saw, so every
    // bucket can carry the same keys (missing -> 0).
    const populated = new Map<number, Record<string, number>>();
    const seenGroups = new Set<string>();
    for (const hourBucket of result.byHour.buckets) {
      const values: Record<string, number> = {};
      for (const group of hourBucket.byGroup.buckets) {
        const key = String(group.key);
        values[key] = group.total.value;
        seenGroups.add(key);
      }
      populated.set(Number(hourBucket.key), values);
    }

    const series: TimeseriesBucket[] = [];
    for (let hour = sinceHour; hour <= untilHour; hour++) {
      const found = populated.get(hour) ?? {};
      const values: Record<string, number> = {};
      for (const group of seenGroups) {
        values[group] = found[group] ?? 0;
      }
      series.push({ time: hourIntToDate(hour), values });
    }
    return series;
  }

  /**
   * Ensure the search index exists (idempotent) and return a reference to it.
   */
  public getIndex(): ReturnType<Redis["search"]["createIndex"]> {
    if (!this.indexPromise) {
      this.indexPromise = this.redis.search.createIndex<typeof EVENT_SCHEMA>({
        name: this.indexName,
        prefix: this.keyPrefix,
        dataType: "hash",
        existsOk: true,
        schema: EVENT_SCHEMA,
      });
    }
    return this.indexPromise;
  }

  /** Drop the search index. The underlying event hashes are left untouched. */
  public async dropIndex(): Promise<void> {
    this.indexPromise = undefined;
    await this.redis.search.index({ name: this.indexName }).drop();
  }
}

/**
 * Stores and reads AI citation analytics on Upstash Redis.
 *
 * Each unique combination of {@link TrackedEvent} dimensions within an hour is
 * stored as a single hash at `<prefix>:event:<data-hash>:<hourInt>` whose
 * `count` field is the number of citations. A Redis Search index over those
 * hashes powers the aggregation queries, exposed under {@link analytics}.
 */
export class AgentAnalytics {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  /** Read/query side, all powered by the search index. */
  public readonly query: AnalyticsQuery;

  public constructor(config: AgentAnalyticsConfig) {
    this.redis = config.redis;
    this.prefix = config.prefix ?? DEFAULT_PREFIX;
    this.ttlSeconds = parseDuration(config.retention ?? DEFAULT_RETENTION);
    const indexName = config.indexName ?? `${this.prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}-events`;
    this.query = new AnalyticsQuery(this.redis, this.keyPrefix, indexName);
  }

  public static fromEnv(config?: Omit<AgentAnalyticsConfig, "redis">): AgentAnalytics {
    return new AgentAnalytics({ redis: UpstashRedis.fromEnv(), ...config });
  }

  /** Prefix shared by every event hash key. Useful for `scan`. */
  protected get keyPrefix(): string {
    return `${this.prefix}:event:`;
  }

  /** Build the full Redis key for an event hash. */
  protected eventKey(hash: string, hourInt: number): string {
    return `${this.keyPrefix}${hash}:${hourInt}`;
  }

  /**
   * Record a single citation occurrence.
   *
   * Dimension order does not matter: `record({ provider, citedUrl })` and
   * `record({ citedUrl, provider })` increment the same counter. Returns the
   * counter's new value.
   */
  public async record(event: TrackedEvent, time: Date = new Date()): Promise<number> {
    const pairs = dimensionPairs(event as Record<string, string | undefined>);
    const hourInt = dateToHourInt(time);
    const key = this.eventKey(dataHash(pairs), hourInt);

    const args: (string | number)[] = [this.ttlSeconds, hourInt, pairs.length];
    for (const [name, value] of pairs) {
      args.push(name, value);
    }

    const count = await this.redis.eval(INGEST_SCRIPT, [key], args);
    return count as number;
  }

  /**
   * Track a citation from an incoming `Request`. Never throws — failures are
   * swallowed and surfaced via the returned `pending` promise.
   */
  public track(req: Request): TrackResponse {
    const response: TrackResponse = { success: true, pending: Promise.resolve() };

    try {
      response.pending = this.record(eventFromRequest(req)).catch((error) => {
        console.warn("Failed to record analytics", error);
      });
    } catch (error) {
      console.warn("Failed to record analytics", error);
    }

    return response;
  }
}
