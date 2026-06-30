/**
 * Evaluate @xtandard/flags from TypeScript using the **standard** OpenFeature
 * server SDK + the generic OFREP provider — deliberately WITHOUT `@xtandard/flags`.
 *
 * This is the "any OpenFeature backend" path: identical code would work against
 * flagd, GO Feature Flag, or any OFREP server. (For a JS/TS service you'd usually
 * prefer the memory-first in-process `@xtandard/flags/openfeature` provider — see
 * ../README.md — but this shows the vendor-neutral remote option.)
 *
 *   bun install && bun run main.ts   # reads FLAGS_URL (default http://localhost:8080)
 */
import { OpenFeature } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";

const base = process.env.FLAGS_URL ?? "http://localhost:8080";
await OpenFeature.setProviderAndWait(new OFREPProvider({ baseUrl: base }));
const client = OpenFeature.getClient();

// Same context any OpenFeature SDK sends: a targeting key + attributes.
const ctx = { targetingKey: "user-42", plan: "beta" };

const newCheckout = await client.getBooleanValue("new-checkout", false, ctx);
const banner = await client.getStringDetails("banner-color", "#000000", ctx);

console.log(`OFREP @ ${base}`);
console.log(`  new-checkout = ${newCheckout}`);
console.log(
  `  banner-color = ${banner.value}  (reason=${banner.reason}, variant=${banner.variant})`,
);
