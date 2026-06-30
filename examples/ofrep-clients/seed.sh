#!/usr/bin/env bash
# Seed a running @xtandard/flags server with the demo flags these clients read.
# Idempotent: replaces the draft, then publishes.
#
#   FLAGS_URL=http://localhost:8080 ./seed.sh
set -euo pipefail
BASE="${FLAGS_URL:-http://localhost:8080}"
API="$BASE/api/projects/default/environments/production"

curl -fsS -X PUT "$API/draft" -H 'content-type: application/json' -d '{
  "projectKey": "default",
  "environmentKey": "production",
  "flags": {
    "new-checkout": {
      "key": "new-checkout", "type": "boolean", "enabled": true, "defaultVariant": "off",
      "variants": { "on": { "value": true }, "off": { "value": false } },
      "rules": [{ "id": "beta", "conditions": [{ "attribute": "plan", "operator": "equals", "value": "beta" }], "serve": { "variant": "on" } }],
      "fallthrough": { "variant": "off" }
    },
    "banner-color": {
      "key": "banner-color", "type": "string", "enabled": true, "defaultVariant": "blue",
      "variants": { "blue": { "value": "#2563eb" }, "green": { "value": "#16a34a" } },
      "fallthrough": { "variant": "blue" }
    }
  }
}' >/dev/null

curl -fsS -X POST "$API/publish" -H 'content-type: application/json' -d '{"message":"seed for ofrep clients"}' >/dev/null
echo "Seeded + published new-checkout, banner-color → $BASE"
