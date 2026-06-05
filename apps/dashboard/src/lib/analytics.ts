import { AgentAnalytics, DEFAULT_PREFIX } from "@usenotra/agent-analytics";
import { Redis } from "@upstash/redis";

let analyticsReady: Promise<AgentAnalytics | null> | undefined;

export async function getAnalyticsReady(): Promise<AgentAnalytics | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  analyticsReady ??= (async () => {
    const analytics = new AgentAnalytics({ redis: Redis.fromEnv() });
    await analytics.query.getIndex();
    return analytics;
  })();

  return analyticsReady;
}

export { DEFAULT_PREFIX };
