import { describe, expect, test } from "vitest";
import { normalizeBasePath, stripBasePath } from "../src/server/base-path.ts";

describe("normalizeBasePath", () => {
  test('"/" and "" and undefined normalize to root ""', () => {
    expect(normalizeBasePath("/")).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath(undefined)).toBe("");
  });

  test('"/flags" is left as-is', () => {
    expect(normalizeBasePath("/flags")).toBe("/flags");
  });

  test('"flags/" gains a leading slash and loses the trailing one', () => {
    expect(normalizeBasePath("flags/")).toBe("/flags");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeBasePath("  /admin/flags  ")).toBe("/admin/flags");
  });
});

describe("stripBasePath", () => {
  test("root base path returns the pathname (or / for empty)", () => {
    expect(stripBasePath("/api/projects", "")).toBe("/api/projects");
    expect(stripBasePath("", "")).toBe("/");
  });

  test("exact match of the base path returns /", () => {
    expect(stripBasePath("/flags", "/flags")).toBe("/");
  });

  test("strips the base prefix from nested paths", () => {
    expect(stripBasePath("/flags/api/projects", "/flags")).toBe("/api/projects");
    expect(stripBasePath("/flags/", "/flags")).toBe("/");
  });

  test("pathname not under the base is returned unchanged", () => {
    expect(stripBasePath("/other/path", "/flags")).toBe("/other/path");
    expect(stripBasePath("", "/flags")).toBe("/");
  });
});
