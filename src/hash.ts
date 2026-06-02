/**
 * Deterministic hashing of an event's dimensions.
 *
 * Two events with the same dimension values must produce the same key,
 * regardless of the order the dimensions were provided in. We achieve this by
 * sorting the dimensions by name before hashing, so `{ p1, p2 }` and
 * `{ p2, p1 }` collapse onto the same `data-hash`.
 */

/** A `[key, value]` pair. */
export type Pair = [string, string];

/**
 * Reduce a dimension record to a sorted list of `[key, value]` pairs.
 *
 * - `undefined`/`null`/empty-string values are dropped (an absent dimension
 *   must not affect the hash).
 * - The result is sorted by key, making the output order-independent.
 */
export function dimensionPairs(dimensions: Record<string, string | undefined>): Pair[] {
  return Object.entries(dimensions)
    .filter((entry): entry is Pair => entry[1] !== undefined && entry[1] !== null && entry[1] !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Build the canonical string for a set of dimension pairs. Values are
 * URL-encoded so that delimiters inside a value can't collide with the
 * separators we use.
 */
export function canonicalize(pairs: Pair[]): string {
  return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

/**
 * A fast, dependency-free 53-bit string hash (cyrb53). Stable across
 * runtimes, which matters because the same logical event may be tracked from
 * different processes and must map to the same key.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Compute the `data-hash` for a set of dimension pairs.
 */
export function dataHash(pairs: Pair[]): string {
  return cyrb53(canonicalize(pairs)).toString(36);
}
