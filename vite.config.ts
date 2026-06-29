import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**", "e2e/**", "test/**/*.bun.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/ui/**", "src/entry-*.ts"],
      reporter: ["text", "html", "lcov"],
    },
  },
  lint: {
    ignorePatterns: ["dist/**", "src/ui/**", "apps/**", "examples/**"],
  },
  fmt: {},
  staged: {
    "*.{ts,tsx}": ["vp fmt", "vp lint"],
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/core.ts",
      "src/schema.ts",
      "src/evaluator.ts",
      "src/snapshot.ts",
      "src/openfeature.ts",
      "src/testing.ts",
      "src/cli.ts",
      "src/entry-storage-memory.ts",
      "src/entry-storage-file.ts",
      "src/entry-storage-redis.ts",
      "src/entry-storage-unstorage.ts",
      "src/entry-storage-postgres.ts",
      "src/entry-storage-mongodb.ts",
      "src/entry-storage-sqlite.ts",
      "src/entry-auth-none.ts",
      "src/entry-auth-basic.ts",
      "src/entry-auth-delegated.ts",
      "src/entry-authorization-none.ts",
      "src/entry-authorization-roles.ts",
      "src/entry-authorization-delegated.ts",
      "src/entry-elysia.ts",
      "src/entry-hono.ts",
      "src/entry-bun.ts",
      "src/entry-express.ts",
    ],
    dts: true,
    format: ["esm", "cjs"],
    sourcemap: true,
    // `bun:sqlite` only exists in the Bun runtime — never bundle/resolve it.
    deps: { neverBundle: [/^bun:/] },
  },
});
