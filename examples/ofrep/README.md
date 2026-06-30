# OFREP — remote evaluation from any language

[OFREP](https://openfeature.dev/docs/reference/other-technologies/ofrep/) (the
**OpenFeature Remote Evaluation Protocol**) is a standard HTTP/JSON contract for
evaluating feature flags. `@xtandard/flags` serves it, so **any** OpenFeature SDK
— in any language — can evaluate flags against your panel using the generic OFREP
provider, with no vendor-specific library.

This example boots a panel and acts as an OFREP client over plain `fetch`,
demonstrating the three compliance features:

1. **Bulk + single evaluation** — each result carries flag `metadata`: the active
   snapshot `version` and the `flagType`.
2. **ETag / `304` caching** — an unchanged re-poll returns `304 Not Modified`
   with no body, so frequent polling is cheap.
3. **SSE streaming** — a `configuration_changed` event fires the moment you
   publish, so clients refresh instantly instead of waiting for the next poll.

```bash
bun install
bun run start
```

Expected output:

```
① Bulk evaluate
   new-checkout = true  [TARGETING_MATCH]  metadata={"version":"v1","flagType":"boolean"}
   banner-color = "#2563eb"  [STATIC]      metadata={"version":"v1","flagType":"string"}
   ETag: "f4ae93a0"   eventStreams: [{"url":"/ofrep/v1/stream"}]
② Re-poll with If-None-Match → HTTP 304 Not Modified
③ Single evaluate banner-color = "#2563eb"
④ Subscribe to SSE, publish a change…
   ← configuration_changed {"version":"v2"}
   re-fetch banner-color = "#16a34a"
```

## The wire protocol (what any client does)

```bash
# Bulk: evaluate all flags for a context
curl -s -X POST $PANEL/ofrep/v1/evaluate/flags \
  -H 'content-type: application/json' \
  -d '{"context":{"targetingKey":"user-42","plan":"beta"}}'

# Single flag
curl -s -X POST $PANEL/ofrep/v1/evaluate/flags/new-checkout \
  -H 'content-type: application/json' \
  -d '{"context":{"targetingKey":"user-42","plan":"beta"}}'
```

## Using it for real (any language)

In production the panel runs separately (Docker, or `npx @xtandard/flags serve`).
Point your app's OpenFeature **OFREP provider** at its URL — e.g. Python:

```python
# pip install openfeature-sdk openfeature-provider-ofrep
from openfeature import api
from openfeature.contrib.provider.ofrep import OFREPProvider

api.set_provider(OFREPProvider(base_url="https://flags.example.com"))
client = api.get_client()
enabled = client.get_boolean_value("new-checkout", False,
            evaluation_context=EvaluationContext("user-42", {"plan": "beta"}))
```

The same works for Go, Java, Rust, PHP, Ruby, .NET, … — that's the point of OFREP:
one server, every language, no custom SDK. Enable SSE on the server (`streaming:
true` / `STREAMING=1`) and providers that support `eventStreams` pick up changes
in real time.

> Trade-off: OFREP puts the control plane in the request path. For JS/TS services,
> the in-process [`@xtandard/flags/openfeature`](../../docs/OPENFEATURE.md) provider
> (memory-first, last-known-good) is the recommended path. See
> [ADR 0004](../../docs/ADR/0004-ofrep-endpoint.md).
