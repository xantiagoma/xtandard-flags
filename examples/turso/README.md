# turso — edge SQLite via libSQL / Turso

Run `@xtandard/flags` on top of [libSQL](https://github.com/tursodatabase/libsql)
— the same SQL dialect as SQLite, but reachable over the network and
edge-replicated by [Turso](https://turso.tech). The `createLibsqlStorage` adapter
implements the **same `FlagsStorage` contract** as every other backend, so the
core and the OpenFeature provider don't know they're talking to the edge.

This script seeds a `theme` flag, publishes a snapshot, and evaluates it through
the OpenFeature provider — proving the whole **author → publish → evaluate** loop
over libSQL.

## Run locally (offline, zero infrastructure)

A `file:` URL is a plain local libSQL database file — no server, no account:

```bash
bun install
bun run start
# Using libSQL database: file:flags.db
# Published v1 with flags: [ "theme" ]
#   u1 (country=CO) → theme=dark
#   u2 (country=US) → theme=light
```

The `flags.db` file is created in the example directory on first run. Delete it to
start fresh.

> Requires the `@libsql/client` peer dependency (declared in this example's
> `package.json`). It is **not** bundled with `@xtandard/flags` — `bun install`
> here pulls it in.

## Run against remote Turso

Create a database with the [Turso CLI](https://docs.turso.tech/cli) (`turso db
create flags`), grab its URL + token, and point the **same code** at it:

```bash
export TURSO_DATABASE_URL="libsql://<db>-<org>.turso.io"
export TURSO_AUTH_TOKEN="<token from: turso db tokens create flags>"
bun run start
```

Nothing else changes — the adapter connects lazily on first use and creates its
tables (`CREATE TABLE IF NOT EXISTS`) automatically.

## How it's wired

- **One database, two tables.** `flags_source` is the canonical drafts/history
  plane; `flags_runtime` holds the published snapshots apps read. (For a real
  deployment you'd more likely split these into two databases or prefixes; two
  tables keep this single-file demo self-contained.)
- The adapter exposes `close()` to release the lazily-created client — the script
  calls it on exit.

## Why libSQL instead of `bun:sqlite`?

`createSqliteStorage` (`bun:sqlite`) is single-file and Bun-only — perfect for a
single node. libSQL/Turso adds **remote access and edge replication**, so it fits
multi-node deployments and edge runtimes where a local file isn't shared.
