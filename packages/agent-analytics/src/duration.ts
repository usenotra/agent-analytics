/**
 * A retention/TTL duration. Either a number of seconds, or a short string
 * like `"28d"`, `"24h"`, `"90m"`, or `"3600s"`.
 */
export type Duration = number | `${number}s` | `${number}m` | `${number}h` | `${number}d`;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * Parse a {@link Duration} into a whole number of seconds.
 */
export function parseDuration(duration: Duration): number {
  if (typeof duration === "number") {
    return Math.floor(duration);
  }

  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: "${duration}". Use e.g. "28d", "24h", "90m", "3600s".`);
  }

  const value = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_SECONDS;
  return value * UNIT_SECONDS[unit]!;
}
