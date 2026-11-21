/**
 * Webhook hook: `createWebhookHook` POSTs admin mutation events to an HTTP
 * endpoint, optionally HMAC-SHA256 signed, with retries and backoff. Best-effort:
 * a failed delivery never fails the mutation. No dependencies.
 *
 * Entry point for the `@xtandard/flags/hooks/webhook` subpath export.
 *
 * @module hooks/webhook
 */

export * from "./hooks/webhook.ts";
