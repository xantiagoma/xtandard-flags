/**
 * `@xtandard/flags/hooks/webhook` — POST mutation events to an HTTP endpoint,
 * optionally HMAC-SHA256 signed, with retry + backoff.
 *
 * Fires on `after` events only (webhooks announce things that already
 * happened). Delivery is best-effort: after exhausting retries it throws, which
 * the core routes to `onHookError` — it never fails the admin mutation. Use it
 * directly, or as a template for Slack/Teams/Discord formatting.
 *
 * @example
 * ```ts
 * import { createFetchHandler } from "@xtandard/flags";
 * import { createWebhookHook } from "@xtandard/flags/hooks/webhook";
 *
 * createFetchHandler({
 *   sourceStorage,
 *   hooks: createWebhookHook({
 *     url: "https://example.com/flag-events",
 *     secret: process.env.WEBHOOK_SECRET,
 *     events: ["published", "rolledback"],
 *   }),
 * });
 * ```
 *
 * @module
 */

import type { AfterEvent, AfterEventType, FlagsHooks } from "./contract.ts";

/** Options for {@link createWebhookHook}. */
export interface WebhookHookOptions {
  /** Destination URL that receives `POST` requests with the event as JSON. */
  url: string;
  /** HMAC-SHA256 signing key. When set, each request carries a signature header. */
  secret?: string;
  /**
   * Restrict which `after` event types are delivered. Default: all of them.
   * (e.g. `["published", "rolledback"]` for publish/rollback notifications.)
   */
  events?: readonly AfterEventType[];
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  /** Header carrying the `sha256=<hex>` signature. Default `"x-flags-signature"`. */
  signatureHeader?: string;
  /** Total delivery attempts before giving up. Default `3`. */
  maxAttempts?: number;
  /** Base backoff in ms; attempt _n_ waits `retryDelayMs * 2^(n-1)`. Default `200`. */
  retryDelayMs?: number;
  /** Per-attempt timeout in ms. Default `10_000`. */
  timeoutMs?: number;
  /** Injectable `fetch` (for tests / custom transport). Default: global `fetch`. */
  fetch?: typeof fetch;
}

/** HMAC-SHA256 of `body` under `secret`, hex-encoded, via Web Crypto. */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a webhook delivery hook. Signs (if `secret` set), retries with
 * exponential backoff, and throws after the final failed attempt so the failure
 * surfaces via `onHookError`.
 */
export function createWebhookHook(options: WebhookHookOptions): FlagsHooks {
  const {
    url,
    secret,
    events,
    headers = {},
    signatureHeader = "x-flags-signature",
    maxAttempts = 3,
    retryDelayMs = 200,
    timeoutMs = 10_000,
    fetch: fetchImpl = fetch,
  } = options;
  const allow = events ? new Set(events) : null;

  return {
    async after(event: AfterEvent) {
      if (allow && !allow.has(event.type)) return;

      const body = JSON.stringify(event);
      const requestHeaders: Record<string, string> = {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      };
      if (secret) requestHeaders[signatureHeader] = `sha256=${await hmacSha256Hex(secret, body)}`;

      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetchImpl(url, {
            method: "POST",
            headers: requestHeaders,
            body,
            signal: controller.signal,
          });
          if (res.ok) return;
          lastError = new Error(`webhook ${url} responded ${res.status}`);
        } catch (err) {
          lastError = err;
        } finally {
          clearTimeout(timer);
        }
        if (attempt < maxAttempts) await sleep(retryDelayMs * 2 ** (attempt - 1));
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(`webhook ${url} delivery failed after ${maxAttempts} attempts`);
    },
  };
}
