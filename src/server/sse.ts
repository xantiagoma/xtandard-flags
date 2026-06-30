/**
 * Server-Sent Events (SSE) for OFREP real-time updates — **opt-in**.
 *
 * When enabled, clients connect to `{basePath}/ofrep/v1/stream` and receive a
 * `configuration_changed` event whenever the active snapshot version changes, so
 * OpenFeature SDKs can re-fetch immediately instead of waiting for their next
 * poll. The OFREP bulk response advertises this endpoint via `eventStreams`.
 *
 * Change detection polls the **default** project/environment's active version on
 * an interval (works with every storage backend; a published change flips the
 * version). It also doubles as a keep-alive. The poller runs only while at least
 * one client is connected and is `unref`'d so it never keeps the process alive.
 *
 * Caveat: SSE needs a runtime that streams a `Response` body (Bun, the standalone
 * `serve`, Hono, Elysia). It is not delivered through the buffering Express adapter.
 *
 * @module
 */

import type { FlagsCore } from "../core.ts";

/** Path (relative to `basePath`) clients connect to for the SSE stream. */
export const SSE_STREAM_PATH = "/ofrep/v1/stream";

/** A live SSE broadcaster for snapshot-change notifications. */
export interface SseManager {
  /** The stream path, relative to `basePath` (e.g. `/ofrep/v1/stream`). */
  readonly path: string;
  /** Open a new SSE connection (a streaming `text/event-stream` response). */
  handle(): Response;
  /** Close all connections and stop the poller (for shutdown/tests). */
  close(): void;
}

/** Options for {@link createSseManager}. */
export interface SseOptions {
  core: FlagsCore;
  /** Change-poll + keep-alive interval in ms. Default `5000`. */
  pollIntervalMs?: number;
}

/** Create an SSE broadcaster that emits `configuration_changed` on snapshot change. */
export function createSseManager(opts: SseOptions): SseManager {
  const pollMs = opts.pollIntervalMs ?? 5000;
  const enc = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastVersion: string | null | undefined;

  const send = (c: ReadableStreamDefaultController<Uint8Array>, text: string): void => {
    try {
      c.enqueue(enc.encode(text));
    } catch {
      // controller already closed; drop.
    }
  };
  const broadcast = (text: string): void => {
    for (const c of clients) send(c, text);
  };

  const tick = async (): Promise<void> => {
    broadcast(`: ping\n\n`); // keep-alive comment
    try {
      const v = await opts.core.getActiveVersion();
      if (lastVersion === undefined) lastVersion = v;
      else if (v !== lastVersion) {
        lastVersion = v;
        broadcast(`event: configuration_changed\ndata: ${JSON.stringify({ version: v })}\n\n`);
      }
    } catch {
      // never throw from the background poller.
    }
  };

  const start = (): void => {
    if (timer) return;
    void tick(); // capture the baseline version now, so a change right after connect is caught
    timer = setInterval(() => void tick(), pollMs);
    (timer as unknown as { unref?: () => void }).unref?.();
  };
  const stopIfIdle = (): void => {
    if (timer && clients.size === 0) {
      clearInterval(timer);
      timer = undefined;
      lastVersion = undefined;
    }
  };

  return {
    path: SSE_STREAM_PATH,
    handle(): Response {
      let ref: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          ref = controller;
          clients.add(controller);
          send(controller, `retry: ${pollMs}\n: connected\n\n`);
          start();
        },
        cancel() {
          if (ref) clients.delete(ref);
          stopIfIdle();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no", // disable proxy buffering (nginx)
        },
      });
    },
    close(): void {
      for (const c of clients) {
        try {
          c.close();
        } catch {
          // ignore
        }
      }
      clients.clear();
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
