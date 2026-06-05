/**
 * Hour-bucket utilities.
 *
 * Events are bucketed by the hour. Internally we represent an hour as an
 * `hourInt` — an integer that increments by one every hour (hours elapsed
 * since the Unix epoch). This is never exposed to consumers of the SDK: the
 * public API always speaks `Date`, and we convert at the boundary.
 */

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Convert a `Date` to its hour bucket.
 *
 * `hourInt` is the number of whole hours between the Unix epoch and `date`.
 * Every event that happens within the same wall-clock hour maps to the same
 * `hourInt`.
 */
export function dateToHourInt(date: Date): number {
  return Math.floor(date.getTime() / HOUR_MS);
}

/**
 * Convert an `hourInt` back to the `Date` at the start of that hour bucket.
 */
export function hourIntToDate(hourInt: number): Date {
  return new Date(hourInt * HOUR_MS);
}
