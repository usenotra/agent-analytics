import type { Geo, Provider, TrackedEvent } from "./types.ts";

type RequestWithGeo = Request & {
  geo?: Geo;
  cf?: Geo;
  ip?: string;
  nextUrl?: { href: string };
};

/**
 * Extract the tracked dimensions from an incoming request. Only the pruned set
 * of {@link TrackedEvent} fields is produced — high-cardinality / PII fields
 * like raw IP and user-agent are deliberately not stored as dimensions.
 */
export function eventFromRequest(req: Request): TrackedEvent {
  const request = req as RequestWithGeo;

  return {
    provider: detectProvider(request),
    path: normalizeUrl(request.nextUrl?.href ?? request.url),
    sourceUrl: normalizeOptionalUrl(
      request.headers.get("referer") ?? request.headers.get("referrer") ?? undefined,
    ),
    country: extractGeo(request).country,
  };
}

function extractGeo(req: RequestWithGeo): Geo {
  return req.geo ?? req.cf ?? {};
}

function normalizeOptionalUrl(url: string | undefined): string | undefined {
  return url === undefined ? undefined : normalizeUrl(url);
}

/** Drop the fragment so `/a#x` and `/a#y` aren't counted separately. */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Infer the AI agent from the user-agent and referrer headers. */
export function detectProvider(req: Request): Provider {
  const userAgent = req.headers.get("user-agent")?.toLowerCase() ?? "";
  const referer = (req.headers.get("referer") ?? req.headers.get("referrer") ?? "").toLowerCase();
  const source = `${userAgent} ${referer}`;

  if (source.includes("chatgpt") || source.includes("openai")) return "chatgpt";
  if (source.includes("claude") || source.includes("anthropic")) return "claude";
  if (source.includes("perplexity")) return "perplexity";
  if (source.includes("gemini") || source.includes("google-extended")) return "gemini";
  if (source.includes("copilot") || source.includes("bing")) return "copilot";

  return "other";
}
