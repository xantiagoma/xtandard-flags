/**
 * Composable change-notifications. `watch` (push-based snapshot refresh in the
 * OpenFeature provider) is **orthogonal** to which storage you use, so rather
 * than bake it into each adapter, {@link withWatch} wraps *any* {@link FlagsStorage}
 * with a {@link WatchSubscribe} source you provide — Postgres `LISTEN`/`NOTIFY`,
 * Redis pub/sub, an ORM after-write hook, a websocket, an `EventEmitter`, etc.
 * Both helpers come from `@xtandard/kit/storage`; {@link pgListenNotify} keeps
 * the flags default channel `"xtandard_flags"`.
 *
 * @example
 * ```ts
 * import { withWatch } from "@xtandard/flags";
 * import { createDrizzleStorage } from "@xtandard/flags/storage/drizzle";
 *
 * const storage = withWatch(createDrizzleStorage({ db, table }), (notify) => {
 *   const sub = redis.subscribe("flag-changes", (m) => notify(m.key));
 *   return () => sub.unsubscribe();
 * });
 * ```
 *
 * @module
 */

import {
  pgListenNotify as kitPgListenNotify,
  type PgNotificationClient,
  type WatchSubscribe,
} from "@xtandard/kit/storage";

export { withWatch, type PgNotificationClient, type WatchSubscribe } from "@xtandard/kit/storage";

/**
 * A {@link WatchSubscribe} source for Postgres `LISTEN`/`NOTIFY`: the database
 * owns the trigger that `pg_notify`s `channel` with the changed key as payload;
 * `client` is a dedicated listening connection.
 *
 * @example
 * ```ts
 * const storage = withWatch(base, pgListenNotify(listener, "xtandard_flags"));
 * ```
 */
export function pgListenNotify(
  client: PgNotificationClient,
  channel = "xtandard_flags",
): WatchSubscribe {
  return kitPgListenNotify(client, channel);
}
