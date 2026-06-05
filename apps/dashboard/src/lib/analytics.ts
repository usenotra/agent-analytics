import { AgentAnalytics, DEFAULT_PREFIX } from "@usenotra/agent-analytics";

import { redis } from "@/lib/redis";

export const ANALYTICS_PREFIX =
  process.env.AGENT_ANALYTICS_PREFIX || DEFAULT_PREFIX;

export const EVENT_KEY_PREFIX = `${ANALYTICS_PREFIX}:event:`;

let analyticsReady: Promise<AgentAnalytics | null> | undefined;

export async function getAnalyticsReady(): Promise<AgentAnalytics | null> {
  if (!redis) {
    return null;
  }

  analyticsReady ??= (async () => {
    try {
      const analytics = new AgentAnalytics({ redis, prefix: ANALYTICS_PREFIX });
      await analytics.query.getIndex();
      return analytics;
    } catch (error) {
      analyticsReady = undefined;
      throw error;
    }
  })();

  return analyticsReady;
}

export { DEFAULT_PREFIX };
