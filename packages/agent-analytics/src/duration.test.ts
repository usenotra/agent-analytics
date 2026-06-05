import { describe, expect, test } from "bun:test";

import { parseDuration } from "./duration.ts";

describe("parseDuration", () => {
  test("passes through a number of seconds", () => {
    expect(parseDuration(3600)).toBe(3600);
  });

  test("parses unit suffixes", () => {
    expect(parseDuration("45s")).toBe(45);
    expect(parseDuration("10m")).toBe(600);
    expect(parseDuration("24h")).toBe(86_400);
    expect(parseDuration("28d")).toBe(28 * 86_400);
  });

  test("throws on a malformed duration", () => {
    // @ts-expect-error invalid duration literal
    expect(() => parseDuration("28x")).toThrow();
  });
});
