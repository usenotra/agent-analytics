import type { Provider } from "@usenotra/agent-analytics";

import { EVENT_KEY_PREFIX, getAnalyticsReady } from "@/lib/analytics";
import {
  PROVIDERS,
  PROVIDER_META,
  type AcceptStat,
  type DailyPoint,
  type PathStat,
  type ProviderStat,
} from "@/lib/dashboard-types";
import { redis } from "@/lib/redis";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_DAYS = 7;

function isProvider(value: string): value is Provider {
  return value in PROVIDER_META;
}

export type DashboardData = {
  connected: boolean;
  total: number;
  delta: number | null;
  topProvider: ProviderStat | null;
  uniquePaths: number;
  providers: ProviderStat[];
  series: DailyPoint[];
  paths: PathStat[];
  acceptHeaders: AcceptStat[];
};

type EventHash = {
  provider?: string;
  path?: string;
  accept?: string;
  count?: number | string;
  hour?: number | string;
};

function toAgentStats(senders: Map<Provider, number>): ProviderStat[] {
  return [...senders.entries()]
    .map(([provider, count]) => ({
      provider,
      label: PROVIDER_META[provider].label,
      color: PROVIDER_META[provider].color,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

async function loadBreakdowns(
  sinceHour: number,
): Promise<{
  pathAgents: Record<string, ProviderStat[]>;
  acceptHeaders: AcceptStat[];
}> {
  if (!redis) return { pathAgents: {}, acceptHeaders: [] };

  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, {
        match: `${EVENT_KEY_PREFIX}*`,
        count: 500,
      });
      cursor = next;
      keys.push(...batch);
    } while (cursor !== "0" && keys.length < 10_000);

    if (!keys.length) return { pathAgents: {}, acceptHeaders: [] };

    const pipe = redis.pipeline();
    for (const key of keys) pipe.hgetall(key);
    const hashes = (await pipe.exec()) as (EventHash | null)[];

    const agentsByPath = new Map<string, Map<Provider, number>>();
    const agentsByAccept = new Map<string, Map<Provider, number>>();

    for (const hash of hashes) {
      if (!hash || hash.provider === undefined || hash.path === undefined) {
        continue;
      }
      if (Number(hash.hour) < sinceHour) continue;
      const count = Number(hash.count) || 0;
      if (count <= 0) continue;

      const provider = String(hash.provider);
      if (!isProvider(provider)) continue;

      const path = String(hash.path);
      const byPath = agentsByPath.get(path) ?? new Map<Provider, number>();
      byPath.set(provider, (byPath.get(provider) ?? 0) + count);
      agentsByPath.set(path, byPath);

      const accept = hash.accept ? String(hash.accept) : "";
      if (accept) {
        const senders = agentsByAccept.get(accept) ?? new Map<Provider, number>();
        senders.set(provider, (senders.get(provider) ?? 0) + count);
        agentsByAccept.set(accept, senders);
      }
    }

    const pathAgents: Record<string, ProviderStat[]> = {};
    for (const [path, senders] of agentsByPath) {
      pathAgents[path] = toAgentStats(senders);
    }

    const acceptHeaders: AcceptStat[] = [...agentsByAccept.entries()]
      .map(([accept, senders]) => {
        const providers = toAgentStats(senders);
        return {
          accept,
          total: providers.reduce((sum, row) => sum + row.count, 0),
          providers,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return { pathAgents, acceptHeaders };
  } catch {
    return { pathAgents: {}, acceptHeaders: [] };
  }
}

function toProviderStats(counts: Record<string, number>): ProviderStat[] {
  return PROVIDERS.map((provider) => ({
    provider,
    label: PROVIDER_META[provider].label,
    color: PROVIDER_META[provider].color,
    count: counts[provider] ?? 0,
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function dayKey(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rollDaily(
  buckets: { time: Date; values: Record<string, number> }[],
): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  const order: string[] = [];

  for (const bucket of buckets) {
    const key = dayKey(bucket.time);
    let point = byDay.get(key);
    if (!point) {
      point = { date: key };
      for (const provider of PROVIDERS) point[provider] = 0;
      byDay.set(key, point);
      order.push(key);
    }
    for (const provider of PROVIDERS) {
      point[provider] = (point[provider] ?? 0) + (bucket.values[provider] ?? 0);
    }
  }

  return order.map((key) => byDay.get(key)!);
}

function buildDemo(): DashboardData {
  const now = Date.now();
  const series: DailyPoint[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = new Date(now - (WINDOW_DAYS - 1 - i) * DAY_MS);
    const wave = Math.sin(i / 1.6) * 0.5 + 1;
    return {
      date: dayKey(date),
      chatgpt: Math.round((14 + i * 2.4) * wave),
      claude: Math.round((9 + i * 1.7) * wave),
      perplexity: Math.round((6 + i) * wave),
      gemini: Math.round((4 + i * 0.7) * wave),
      copilot: Math.round((2 + i * 0.4) * wave),
    };
  });

  const counts: Record<string, number> = {};
  for (const point of series) {
    for (const provider of PROVIDERS) {
      counts[provider] = (counts[provider] ?? 0) + (point[provider] ?? 0);
    }
  }

  const providers = toProviderStats(counts);
  const total = providers.reduce((sum, row) => sum + row.count, 0);
  const basePaths: { path: string; count: number }[] = [
    { path: "/blog/scaling-redis-on-the-edge", count: 142 },
    { path: "/docs/getting-started", count: 118 },
    { path: "/pricing", count: 87 },
    { path: "/blog/ai-citation-tracking", count: 64 },
    { path: "/changelog", count: 39 },
  ];
  const paths: PathStat[] = basePaths.map((row, i) => ({
    ...row,
    agents: providers.slice(i % 2, (i % 2) + 3).map((provider, j) => ({
      ...provider,
      count: Math.max(1, Math.round(row.count / (j + 2))),
    })),
  }));

  const acceptDemo: { accept: string; senders: Provider[] }[] = [
    { accept: "text/html,application/xhtml+xml", senders: ["chatgpt", "claude", "perplexity"] },
    { accept: "text/markdown, text/html;q=0.8", senders: ["claude", "chatgpt"] },
    { accept: "application/json", senders: ["gemini", "copilot"] },
  ];
  const acceptHeaders: AcceptStat[] = acceptDemo.map((row, i) => {
    const providersForAccept = row.senders.map((provider, j) => ({
      provider,
      label: PROVIDER_META[provider].label,
      color: PROVIDER_META[provider].color,
      count: Math.max(1, Math.round((48 - i * 12) / (j + 1))),
    }));
    return {
      accept: row.accept,
      total: providersForAccept.reduce((sum, p) => sum + p.count, 0),
      providers: providersForAccept,
    };
  });

  return {
    connected: false,
    total,
    delta: 12.4,
    topProvider: providers[0] ?? null,
    uniquePaths: paths.length,
    providers,
    series,
    paths,
    acceptHeaders,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const analytics = await getAnalyticsReady();
    if (!analytics) return buildDemo();

    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const prevSince = new Date(now.getTime() - 2 * WINDOW_DAYS * DAY_MS);

    const sinceHour = Math.floor(since.getTime() / HOUR_MS);
    const [byProvider, prevByProvider, buckets, byPath, breakdowns] =
      await Promise.all([
        analytics.query.aggregateBy({ since, field: "provider" }),
        analytics.query.aggregateBy({
          since: prevSince,
          until: since,
          field: "provider",
        }),
        analytics.query.timeseries({ since, groupBy: "provider" }),
        analytics.query.aggregateBy({ since, field: "path" }),
        loadBreakdowns(sinceHour),
      ]);

    const providers = toProviderStats(byProvider);
    const total = providers.reduce((sum, row) => sum + row.count, 0);
    const prevTotal = Object.values(prevByProvider).reduce(
      (sum, value) => sum + value,
      0,
    );
    const delta =
      prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

    const paths: PathStat[] = Object.entries(byPath)
      .map(([path, count]) => ({
        path,
        count,
        agents: breakdowns.pathAgents[path] ?? [],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      connected: true,
      total,
      delta,
      topProvider: providers[0] ?? null,
      uniquePaths: Object.keys(byPath).length,
      providers,
      series: rollDaily(buckets),
      paths,
      acceptHeaders: breakdowns.acceptHeaders,
    };
  } catch {
    return buildDemo();
  }
}
