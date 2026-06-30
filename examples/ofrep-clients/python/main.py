"""
Evaluate @xtandard/flags from Python via the standard OpenFeature SDK + the
generic OFREP provider — no vendor-specific library.

  uv run main.py            # reads FLAGS_URL (default http://localhost:8080)

The panel must be running and seeded (see ../README.md + ../seed.sh).
"""

import os

from openfeature import api
from openfeature.contrib.provider.ofrep import OFREPProvider
from openfeature.evaluation_context import EvaluationContext

base = os.environ.get("FLAGS_URL", "http://localhost:8080")
api.set_provider(OFREPProvider(base_url=base))
client = api.get_client()

# Same context any OpenFeature SDK sends: a targeting key + attributes.
ctx = EvaluationContext(targeting_key="user-42", attributes={"plan": "beta"})

new_checkout = client.get_boolean_value("new-checkout", False, ctx)
banner = client.get_string_details("banner-color", "#000000", ctx)

print(f"OFREP @ {base}")
print(f"  new-checkout = {new_checkout}")
print(f"  banner-color = {banner.value}  (reason={banner.reason}, variant={banner.variant})")
