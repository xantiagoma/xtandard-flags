import { describe, expect, test } from "vitest";
import { hashToUnitInterval, murmur3 } from "../src/hash.ts";

describe("murmur3", () => {
  test("is deterministic", () => {
    expect(murmur3("hello")).toBe(murmur3("hello"));
  });

  test("matches known reference vectors (seed 0)", () => {
    // Reference values for MurmurHash3 x86 32-bit, seed 0.
    expect(murmur3("")).toBe(0);
    expect(murmur3("hello")).toBe(613153351);
    expect(murmur3("The quick brown fox jumps over the lazy dog")).toBe(776992547);
  });

  test("seed changes the result", () => {
    expect(murmur3("hello", 1)).not.toBe(murmur3("hello", 0));
  });

  test("returns an unsigned 32-bit integer", () => {
    for (const s of ["a", "abc", "xtandard", "🚀 unicode"]) {
      const h = murmur3(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe("hashToUnitInterval", () => {
  test("is always in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const u = hashToUnitInterval(`user_${i}`);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  test("is roughly uniform", () => {
    const buckets = Array.from({ length: 10 }, () => 0);
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const u = hashToUnitInterval(`subject-${i}`);
      const idx = Math.floor(u * 10);
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    for (const count of buckets) {
      // Each decile should hold ~10% ± 1.5%.
      expect(Math.abs(count / N - 0.1)).toBeLessThan(0.015);
    }
  });
});
