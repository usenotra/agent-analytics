import { describe, expect, test } from "bun:test";

import { dateToHourInt, hourIntToDate, HOUR_MS } from "./time.ts";

describe("dateToHourInt", () => {
  test("the Unix epoch is hour 0", () => {
    expect(dateToHourInt(new Date(0))).toBe(0);
  });

  test("counts whole hours since the epoch", () => {
    expect(dateToHourInt(new Date(5 * HOUR_MS))).toBe(5);
  });

  test("floors within an hour: any minute maps to the same bucket", () => {
    const base = 100 * HOUR_MS;
    expect(dateToHourInt(new Date(base))).toBe(100);
    expect(dateToHourInt(new Date(base + 59 * 60 * 1000))).toBe(100);
    expect(dateToHourInt(new Date(base + HOUR_MS - 1))).toBe(100);
    expect(dateToHourInt(new Date(base + HOUR_MS))).toBe(101);
  });
});

describe("hourIntToDate", () => {
  test("returns the start of the hour bucket", () => {
    expect(hourIntToDate(100).getTime()).toBe(100 * HOUR_MS);
  });

  test("round-trips with dateToHourInt", () => {
    const date = new Date("2026-06-01T13:37:00.000Z");
    const hour = dateToHourInt(date);
    const start = hourIntToDate(hour);
    // The bucket start is at the top of the hour.
    expect(start.getTime()).toBeLessThanOrEqual(date.getTime());
    expect(dateToHourInt(start)).toBe(hour);
  });
});
