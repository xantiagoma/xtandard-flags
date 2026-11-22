/**
 * Storage conformance for the flags drivers: the shared
 * `@xtandard/kit/storage/testing` suite (run with the `flags` key root), plus
 * the flags key layout (snapshots, active version, drafts) on every backend.
 *
 * This file deliberately omits the `.test.ts` suffix so vitest does not pick it
 * up as a standalone suite — it only runs when imported by an adapter's test,
 * which injects its runner (`vitest` or `bun:test`).
 *
 * @module
 */

import {
  runConformanceCases,
  runStorageConformance,
  type ConformanceCapabilities,
  type ConformanceCase,
  type ConformanceTestApi,
  type MakeStorage,
  type SeedLegacy,
} from "@xtandard/kit/storage/testing";
import { activeVersionKey, draftKey, ROOT, snapshotKey, snapshotsPrefix } from "../src/keys.ts";

/** What a backend opts into. */
export interface StorageContractOptions {
  /** The injected test API (`{ describe, test, expect }` from vitest or bun:test). */
  t: ConformanceTestApi;
  /** Capabilities for the kit suite — declare every one (`false` for what the driver lacks). */
  capabilities: ConformanceCapabilities;
  /** Write a non-canonical stored form directly (the kit's legacy-CAS case). */
  seedLegacy?: SeedLegacy;
  /** Per-test timeout (live backends). */
  timeout?: number;
}

/** The flags key layout on any backend. */
export const flagsLayoutCases: ConformanceCase[] = [
  {
    name: "snapshots, the active version and the draft of one environment",
    async run({ storage, expect }) {
      await storage.setItem(snapshotKey("web", "prod", "v1"), { schemaVersion: 1, flags: {} });
      await storage.setItem(snapshotKey("web", "prod", "v2"), { schemaVersion: 1, flags: {} });
      await storage.setItem(activeVersionKey("web", "prod"), "v2");
      await storage.setItem(draftKey("web", "prod"), { flags: { a: { type: "boolean" } } });
      await storage.setItem(snapshotKey("web", "staging", "v1"), { schemaVersion: 1, flags: {} });
      expect((await storage.getKeys(`${snapshotsPrefix("web", "prod")}/`)).sort()).toEqual([
        snapshotKey("web", "prod", "v1"),
        snapshotKey("web", "prod", "v2"),
      ]);
      expect(await storage.getItem(activeVersionKey("web", "prod"))).toBe("v2");
      expect(await storage.getItem(draftKey("web", "prod"))).toEqual({
        flags: { a: { type: "boolean" } },
      });
    },
  },
  {
    name: "projects that differ only by case are isolated",
    async run({ storage, expect }) {
      await storage.setItem(activeVersionKey("acme", "prod"), "v1");
      await storage.setItem(activeVersionKey("ACME", "prod"), "v9");
      expect(await storage.getKeys(`${ROOT}/acme/`)).toEqual([activeVersionKey("acme", "prod")]);
      expect(await storage.getKeys(`${ROOT}/ACME/`)).toEqual([activeVersionKey("ACME", "prod")]);
    },
  },
];

/**
 * Register the kit conformance suite (with the `flags` key root) and the flags
 * key-layout cases for one backend.
 */
export function runStorageContractTests(
  name: string,
  makeStorage: MakeStorage,
  options: StorageContractOptions,
): void {
  const shared = { t: options.t, keyRoot: ROOT, timeout: options.timeout };
  runStorageConformance(name, makeStorage, {
    ...shared,
    capabilities: options.capabilities,
    seedLegacy: options.seedLegacy,
  });
  runConformanceCases(`flags key layout: ${name}`, flagsLayoutCases, makeStorage, shared);
}
