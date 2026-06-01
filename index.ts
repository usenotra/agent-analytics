import type { Aggregate } from "@upstash/core-analytics";
import { Analytics as CoreAnalytics } from "@upstash/core-analytics";
import { Redis as UpstashRedis } from "@upstash/redis";

export type Geo = {
  country?: string;
  city?: string;
  region?: string;
  ip?: string;
};

type RequestWithGeo = Request & {
  geo?: Geo;
  cf?: Geo;
  ip?: string;
  nextUrl?: {
    href: string;
  };
};

export type Provider =
  | "chatgpt"
  | "claude"
  | "perplexity"
  | "gemini"
  | "copilot"
  | "other"
  | (string & {});

export type Redis = Pick<UpstashRedis, "zincrby" | "eval" | "pipeline">;

export type Event = Geo & {
  provider: Provider;
  citedUrl: string;
  time: number;
  sourceUrl?: string;
  query?: string;
  site?: string;
  userAgent?: string;
};

export type AnalyticsConfig = {
  redis: Redis;
  prefix?: string;
};

export type TrackResponse = {
  success: true;
  pending: Promise<unknown>;
};

export type AgentAnalyticsConfig = {
  redis: Redis;
  /**
   * All analytics keys in Redis are prefixed with this.
   *
   * @default "@upstash/ai-tracking"
   */
  prefix?: string;
};

export const DEFAULT_PREFIX = "@upstash/ai-tracking";

/**
 * Stores and reads AI citation analytics.
 *
 * This mirrors @upstash/ratelimit's analytics wrapper: 1 hour buckets,
 * an `events` table, 90 day retention, and a configurable Redis prefix.
 */
export class Analytics {
  private readonly analytics: CoreAnalytics;
  private readonly table = "events";

  public constructor(config: AnalyticsConfig) {
    this.analytics = new CoreAnalytics({
      // @ts-expect-error core-analytics currently requires the full Redis SDK type.
      redis: config.redis,
      window: "1h",
      prefix: config.prefix ?? DEFAULT_PREFIX,
      retention: "90d",
    });
  }

  /**
   * Try to extract geo information from a request.
   *
   * This handles Vercel's `req.geo` and Cloudflare's `request.cf` properties.
   */
  public extractGeo(req: { geo?: Geo; cf?: Geo }): Geo {
    if (req.geo !== undefined) {
      return req.geo;
    }

    if (req.cf !== undefined) {
      return req.cf;
    }

    return {};
  }

  public async record(event: Event): Promise<void> {
    await this.analytics.ingest(this.table, normalizeEvent(event));
  }

  public async series<TFilter extends keyof Event>(
    filter: TFilter,
    cutoff: number,
  ): Promise<Aggregate[]> {
    const timestampCount = Math.min(
      (this.analytics.getBucket(Date.now()) - this.analytics.getBucket(cutoff)) /
        (60 * 60 * 1000),
      256,
    );

    return this.analytics.aggregateBucketsWithPipeline(this.table, filter, timestampCount);
  }

  public async getUsage(cutoff = 0): Promise<Record<string, number>> {
    return this.sumBy("provider", cutoff);
  }

  public async getPages(cutoff = 0): Promise<Record<string, number>> {
    return this.sumBy("citedUrl", cutoff);
  }

  public async getUsageOverTime<TFilter extends keyof Event>(
    timestampCount: number,
    groupBy: TFilter,
  ): Promise<Aggregate[]> {
    return this.analytics.aggregateBucketsWithPipeline(this.table, groupBy, timestampCount);
  }

  private async sumBy<TFilter extends keyof Event>(
    groupBy: TFilter,
    cutoff: number,
  ): Promise<Record<string, number>> {
    const records = await this.series(groupBy, cutoff);
    const counts: Record<string, number> = {};

    for (const record of records) {
      for (const [key, value] of Object.entries(record[groupBy] ?? {})) {
        counts[key] = (counts[key] ?? 0) + value;
      }
    }

    return counts;
  }
}

export class AgentAnalytics {
  private readonly analytics: Analytics;

  public constructor(config: AgentAnalyticsConfig) {
    this.analytics = new Analytics({
      redis: config.redis,
      prefix: config.prefix ?? DEFAULT_PREFIX,
    });
  }

  public static fromEnv(config?: Omit<AgentAnalyticsConfig, "redis">): AgentAnalytics {
    return new AgentAnalytics({
      redis: UpstashRedis.fromEnv(),
      ...config,
    });
  }

  public track(req: Request): TrackResponse {
    const response: TrackResponse = {
      success: true,
      pending: Promise.resolve(),
    };

    try {
      const pending = this.analytics.record({
        ...eventFromRequest(req),
        time: Date.now(),
      }).catch((error) => {
        console.warn("Failed to record analytics", error);
      });

      response.pending = Promise.all([response.pending, pending]);
    } catch (error) {
      console.warn("Failed to record analytics", error);
    }

    return response;
  }
}

export function track(tracker: AgentAnalytics, req: Request): TrackResponse {
  return tracker.track(req);
}

function normalizeEvent(event: Event): Record<string, string | number | boolean | undefined> {
  return {
    ...event,
    provider: event.provider.toLowerCase(),
    citedUrl: normalizeUrl(event.citedUrl),
    sourceUrl: event.sourceUrl ? normalizeUrl(event.sourceUrl) : undefined,
  };
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function eventFromRequest(req: Request): Omit<Event, "time"> {
  const request = req as RequestWithGeo;
  const geo = extractGeo(request);

  return {
    ...geo,
    provider: detectProvider(request),
    citedUrl: request.nextUrl?.href ?? request.url,
    sourceUrl: request.headers.get("referer") ?? request.headers.get("referrer") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    ip:
      request.ip ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined,
  };
}

function extractGeo(req: RequestWithGeo): Geo {
  if (req.geo !== undefined) {
    return req.geo;
  }

  if (req.cf !== undefined) {
    return req.cf;
  }

  return {};
}

function detectProvider(req: Request): Provider {
  const userAgent = req.headers.get("user-agent")?.toLowerCase() ?? "";
  const referer = (
    req.headers.get("referer") ??
    req.headers.get("referrer") ??
    ""
  ).toLowerCase();
  const source = `${userAgent} ${referer}`;

  if (source.includes("chatgpt") || source.includes("openai")) {
    return "chatgpt";
  }

  if (source.includes("claude") || source.includes("anthropic")) {
    return "claude";
  }

  if (source.includes("perplexity")) {
    return "perplexity";
  }

  if (source.includes("gemini") || source.includes("google-extended")) {
    return "gemini";
  }

  if (source.includes("copilot") || source.includes("bing")) {
    return "copilot";
  }

  return "other";
}
