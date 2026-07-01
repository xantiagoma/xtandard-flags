/**
 * Drizzle storage adapter — a {@link FlagsStorage} over a **consumer-owned**
 * Drizzle table and database. Unlike {@link ./postgres.createPostgresStorage} it
 * issues **no DDL** (the table lives in your Drizzle schema + migrations) and
 * **owns no connection** (it reuses the `db` you pass, and never closes it).
 *
 * Dialect-agnostic: works with Postgres, MySQL, and SQLite Drizzle databases.
 * Build the backing table with the matching factory —
 * {@link ../drizzle/pg.pgFlagsTable} / {@link ../drizzle/mysql.mysqlFlagsTable} /
 * {@link ../drizzle/sqlite.sqliteFlagsTable} — whose fixed `key`/`value` columns
 * this adapter reads and writes.
 *
 * @example
 * ```ts
 * import { drizzle } from "drizzle-orm/node-postgres";
 * import { createDrizzleStorage } from "@xtandard/flags/storage/drizzle";
 * import { pgFlagsTable } from "@xtandard/flags/drizzle/pg";
 *
 * export const flagsKv = pgFlagsTable("flags_kv"); // add to your schema + migrate
 * const db = drizzle(pool);                        // your existing pool
 * const storage = createDrizzleStorage({ db, table: flagsKv });
 * ```
 *
 * @module
 */

import { eq, sql, type Column, type SQL, type Table } from "drizzle-orm";
import type { FlagsStorage, StorageChangeEvent, WatchableFlagsStorage } from "./contract.ts";

/** The KV table shape this adapter reads/writes (produced by the `*FlagsTable` factories). */
export type DrizzleKvTable = Table & { key: Column; value: Column };

/**
 * Minimal structural view of a Drizzle database — the query-builder entry points
 * the KV adapter uses. This is the internal contract the adapter casts `db` to;
 * the public option is typed `unknown` because a dialect-agnostic structural type
 * cannot match dialect-specific dbs (their `.from`/`.insert` want `PgTable` etc.,
 * not the base `Table`). The upsert method differs by dialect and is
 * feature-detected at runtime.
 */
interface DrizzleLikeDatabase {
  select(fields: Record<string, Column>): {
    from(table: Table): { where(where: SQL): PromiseLike<unknown[]> };
  };
  insert(table: Table): {
    values(row: { key: string; value: unknown }): {
      /** Postgres + SQLite upsert. */
      onConflictDoUpdate?(config: {
        target: Column;
        set: { value: unknown };
      }): PromiseLike<unknown>;
      /** MySQL upsert. */
      onDuplicateKeyUpdate?(config: { set: { value: unknown } }): PromiseLike<unknown>;
    };
  };
  delete(table: Table): { where(where: SQL): PromiseLike<unknown> };
}

/**
 * A dedicated notification-capable client for {@link DrizzleWatchOptions} —
 * satisfied by a `pg` `Client`. Used for `LISTEN`/`UNLISTEN` on the change channel.
 */
export interface DrizzleNotificationClient {
  query(sql: string): Promise<unknown>;
  on(event: "notification", listener: (msg: { channel: string; payload?: string }) => void): void;
  removeListener(
    event: "notification",
    listener: (msg: { channel: string; payload?: string }) => void,
  ): void;
}

/** Opt-in change notifications via Postgres `LISTEN`/`NOTIFY`. */
export interface DrizzleWatchOptions {
  /**
   * A dedicated notification client (e.g. a `pg` `Client` you `connect()`).
   * Its lifecycle is yours — the adapter never closes it.
   */
  client: DrizzleNotificationClient;
  /**
   * `NOTIFY` channel your trigger fires on, with the changed key as the payload.
   * Default `"xtandard_flags"`. You own the trigger (added via your migrations) —
   * the adapter issues no DDL.
   */
  channel?: string;
}

/** Options for {@link createDrizzleStorage}. */
export interface DrizzleStorageOptions {
  /**
   * Your Drizzle database (node-postgres / mysql2 / better-sqlite3 / pglite / …).
   * Typed `unknown` intentionally — a single dialect-agnostic type can't match
   * every dialect's db; the adapter only calls `select`/`insert`/`delete`.
   */
  db: unknown;
  /** The KV table built with a `*FlagsTable` factory (or matching that shape). */
  table: DrizzleKvTable;
  /** Enable push change-notifications (Postgres `LISTEN`/`NOTIFY`). Adds `watch`. */
  watch?: DrizzleWatchOptions;
}

/** A {@link FlagsStorage} over a Drizzle table; gains `watch` when configured. */
export type DrizzleFlagsStorage = FlagsStorage & Partial<Pick<WatchableFlagsStorage, "watch">>;

/** Escape LIKE wildcards so `getKeys` matches the prefix verbatim (paired with `ESCAPE '\'`). */
const escapeLike = (literal: string): string => literal.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Parse a value defensively — Drizzle returns json parsed, but a string is parsed too. */
const parseValue = <T>(value: unknown): T => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value as T;
};

/**
 * Create a Drizzle-backed {@link DrizzleFlagsStorage}. No DDL, no connection
 * ownership. The upsert dialect (Postgres/SQLite `onConflictDoUpdate` vs MySQL
 * `onDuplicateKeyUpdate`) is detected at runtime from the insert builder.
 */
export function createDrizzleStorage(options: DrizzleStorageOptions): DrizzleFlagsStorage {
  const db = options.db as DrizzleLikeDatabase;
  const { table } = options;

  const storage: DrizzleFlagsStorage = {
    async getItem<T>(key: string): Promise<T | null> {
      const rows = (await db
        .select({ value: table.value })
        .from(table)
        .where(eq(table.key, key))) as Array<{ value: unknown }>;
      const row = rows[0];
      if (row === undefined || row.value === null || row.value === undefined) return null;
      return parseValue<T>(row.value);
    },

    async setItem<T>(key: string, value: T): Promise<void> {
      const insert = db.insert(table).values({ key, value });
      if (typeof insert.onConflictDoUpdate === "function") {
        await insert.onConflictDoUpdate({ target: table.key, set: { value } });
      } else if (typeof insert.onDuplicateKeyUpdate === "function") {
        await insert.onDuplicateKeyUpdate({ set: { value } });
      } else {
        throw new Error(
          "createDrizzleStorage: the Drizzle database exposes no known upsert method " +
            "(onConflictDoUpdate / onDuplicateKeyUpdate).",
        );
      }
    },

    async removeItem(key: string): Promise<void> {
      await db.delete(table).where(eq(table.key, key));
    },

    async getKeys(prefix: string): Promise<string[]> {
      const pattern = `${escapeLike(prefix)}%`;
      const rows = (await db
        .select({ key: table.key })
        .from(table)
        .where(sql`${table.key} like ${pattern} escape '\\'`)) as Array<{ key: unknown }>;
      return rows.map((row) => String(row.key));
    },
  };

  const watch = options.watch;
  if (watch) {
    const channel = watch.channel ?? "xtandard_flags";
    storage.watch = async (prefix, callback) => {
      const listener = (msg: { channel: string; payload?: string }) => {
        if (msg.channel !== channel) return;
        const key = msg.payload ?? "";
        if (key && !key.startsWith(prefix)) return;
        callback({ type: "update", key: key || prefix } satisfies StorageChangeEvent);
      };
      watch.client.on("notification", listener);
      await watch.client.query(`LISTEN "${channel}"`);
      return async () => {
        watch.client.removeListener("notification", listener);
        await watch.client.query(`UNLISTEN "${channel}"`);
      };
    };
  }

  return storage;
}
