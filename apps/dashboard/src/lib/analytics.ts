import { AgentAnalytics, DEFAULT_PREFIX } from "@usenotra/agent-analytics";
import { Redis } from "@upstash/redis";

export function getAnalytics(): AgentAnalytics | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return new AgentAnalytics({ redis: Redis.fromEnv() });
}

export { DEFAULT_PREFIX };
