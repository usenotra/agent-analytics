import { describe, expect, test } from "bun:test";

import { canonicalize, dataHash, dimensionPairs } from "./hash.ts";

describe("dimensionPairs", () => {
  test("sorts by key so input order does not matter", () => {
    const a = dimensionPairs({ p1: "1", p2: "2" });
    const b = dimensionPairs({ p2: "2", p1: "1" });
    expect(a).toEqual([["p1", "1"], ["p2", "2"]]);
    expect(a).toEqual(b);
  });

  test("drops undefined and empty values", () => {
    expect(dimensionPairs({ provider: "chatgpt", country: undefined, sourceUrl: "" })).toEqual([
      ["provider", "chatgpt"],
    ]);
  });
});

describe("canonicalize", () => {
  test("url-encodes values so separators inside a value cannot collide", () => {
    expect(canonicalize([["citedUrl", "https://x.com/a?b=1&c=2"]])).toBe(
      "citedUrl=https%3A%2F%2Fx.com%2Fa%3Fb%3D1%26c%3D2",
    );
  });
});

describe("dataHash", () => {
  test("is order-independent", () => {
    const fromOneOrder = dataHash(dimensionPairs({ provider: "chatgpt", citedUrl: "/a" }));
    const fromOtherOrder = dataHash(dimensionPairs({ citedUrl: "/a", provider: "chatgpt" }));
    expect(fromOneOrder).toBe(fromOtherOrder);
  });

  test("differs when any value differs", () => {
    const base = dataHash(dimensionPairs({ provider: "chatgpt", citedUrl: "/a" }));
    expect(dataHash(dimensionPairs({ provider: "claude", citedUrl: "/a" }))).not.toBe(base);
    expect(dataHash(dimensionPairs({ provider: "chatgpt", citedUrl: "/b" }))).not.toBe(base);
  });

  test("adding a dimension changes the hash", () => {
    const without = dataHash(dimensionPairs({ provider: "chatgpt", citedUrl: "/a" }));
    const withCountry = dataHash(
      dimensionPairs({ provider: "chatgpt", citedUrl: "/a", country: "US" }),
    );
    expect(withCountry).not.toBe(without);
  });
});
