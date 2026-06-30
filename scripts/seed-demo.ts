/**
 * Seed a running `@xtandard/flags` server with a complete, representative dataset
 * — one of (nearly) everything the product does — so the dashboard has something
 * real to show. Idempotent enough for a fresh in-memory server.
 *
 * Usage:
 *   bun scripts/seed-demo.ts                 # seeds http://localhost:7788
 *   BASE_URL=http://localhost:3000 bun scripts/seed-demo.ts
 *
 * Or, to boot a throwaway standalone server AND seed it in one go: `bun run demo`.
 *
 * @module
 */

const DEFAULT_BASE = (process.env.BASE_URL ?? "http://localhost:7788").replace(/\/$/, "");

/** Days-ago ISO timestamp, for seeding flags with realistic ages. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const envBase = (project: string, env: string) =>
  `/api/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(env)}`;

/** Seed a complete demo dataset against the server at `base`. */
export async function seed(base: string = DEFAULT_BASE): Promise<void> {
  const BASE = base.replace(/\/$/, "");
  let okCount = 0;
  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    okCount++;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  console.log(`Seeding ${BASE} …`);

  // --- Projects & environments (multi-tenant: one extra of each) ---
  await call("POST", "/api/projects", { key: "billing", name: "Billing" });
  await call("POST", "/api/projects/default/environments", { key: "staging", name: "Staging" });

  const prod = envBase("default", "production");

  // --- A reusable segment, referenced by a rule below (inSegment) ---
  await call("POST", `${prod}/segments`, {
    key: "eu-beta",
    name: "EU beta cohort",
    description: "Beta users in the EU",
    conditions: [
      { attribute: "country", operator: "in", value: ["FR", "DE", "ES"] },
      { attribute: "plan", operator: "equals", value: "beta" },
    ],
  });

  // --- A second segment, excluded via notInSegment below ---
  await call("POST", `${prod}/segments`, {
    key: "internal-staff",
    name: "Internal staff",
    description: "Employees — excluded from external rollouts",
    conditions: [{ attribute: "email", operator: "endsWith", value: "@acme.com" }],
  });

  // --- A kill-switch other flags depend on (prerequisite target) ---
  await call("POST", `${prod}/flags`, {
    key: "kill-switch",
    type: "boolean",
    enabled: true,
    description: "Master switch for the checkout revamp",
    defaultVariant: "on",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "on" },
    tags: ["ops"],
    owner: { name: "Platform", team: "Infra" },
  });

  // --- Boolean flag: owner, tags, a prerequisite, and a segment-targeted rule ---
  await call("POST", `${prod}/flags`, {
    key: "new-checkout",
    type: "boolean",
    enabled: true,
    description: "Roll out the redesigned checkout",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["checkout", "beta"],
    owner: { name: "Ada Lovelace", email: "ada@example.com", team: "Growth" },
    expectedLifetimeDays: 90,
    prerequisites: [{ flagKey: "kill-switch", variant: "on" }],
    rules: [
      {
        id: "eu-beta-rule",
        name: "EU beta cohort → on",
        conditions: [{ attribute: "", operator: "inSegment", value: "eu-beta" }],
        serve: { variant: "on" },
      },
    ],
  });

  // --- String flag with a weighted split (A/B/C) ---
  await call("POST", `${prod}/flags`, {
    key: "banner-color",
    type: "string",
    enabled: true,
    description: "Homepage banner color experiment",
    defaultVariant: "blue",
    variants: {
      blue: { value: "#2563eb", name: "Blue" },
      green: { value: "#16a34a", name: "Green" },
      amber: { value: "#d97706", name: "Amber" },
    },
    fallthrough: {
      split: [
        { variant: "blue", weight: 34 },
        { variant: "green", weight: 33 },
        { variant: "amber", weight: 33 },
      ],
    },
    tags: ["experiment", "marketing"],
    owner: { name: "Grace Hopper", team: "Marketing" },
  });

  // --- Number flag ---
  await call("POST", `${prod}/flags`, {
    key: "api-rate-limit",
    type: "number",
    enabled: true,
    description: "Requests per minute per key",
    defaultVariant: "standard",
    variants: { standard: { value: 60 }, premium: { value: 600 } },
    fallthrough: { variant: "standard" },
    tags: ["api"],
  });

  // --- JSON flag ---
  await call("POST", `${prod}/flags`, {
    key: "home-layout",
    type: "json",
    enabled: true,
    description: "Structured homepage layout config",
    defaultVariant: "control",
    variants: {
      control: { value: { columns: 2, hero: "static" } },
      treatment: { value: { columns: 3, hero: "carousel" } },
    },
    fallthrough: { variant: "control" },
  });

  // --- A STALE flag: old + idle + past its expected lifetime (created in the past) ---
  await call("POST", `${prod}/flags`, {
    key: "legacy-promo",
    type: "boolean",
    enabled: true,
    description: "Old promo toggle nobody has touched",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["deprecated"],
    expectedLifetimeDays: 30,
    createdAt: daysAgo(140),
    updatedAt: daysAgo(120),
  });

  // --- An ARCHIVED flag (created, then archived → excluded from snapshots) ---
  await call("POST", `${prod}/flags`, {
    key: "old-banner",
    type: "boolean",
    enabled: false,
    description: "Retired banner",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["deprecated"],
  });
  await call("POST", `${prod}/flags/old-banner/archive`);

  // --- Query-matcher rules (`matches`): sift query + regex, plus overrides ---
  await call("POST", `${prod}/flags`, {
    key: "premium-features",
    type: "boolean",
    enabled: true,
    description: "Unlock premium UI — multi-rule (first match wins) + overrides",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["growth", "experiment"],
    owner: { name: "Alan Turing", team: "Growth" },
    rules: [
      {
        id: "power-users",
        name: "Power users (sift query)",
        conditions: [
          {
            attribute: "",
            operator: "matches",
            matcher: "sift",
            value: { $or: [{ seats: { $gt: 50 } }, { plan: "enterprise" }] },
          },
        ],
        serve: { variant: "on" },
      },
      {
        id: "internal-domains",
        name: "Company email domains (regex)",
        conditions: [
          {
            attribute: "email",
            operator: "matches",
            matcher: "regex",
            value: { pattern: "@(acme|bigco)\\.com$", flags: "i" },
          },
        ],
        serve: { variant: "on" },
      },
      {
        id: "loyal-accounts",
        name: "Long-tenured accounts (numeric)",
        conditions: [{ attribute: "accountAgeDays", operator: "greaterThan", value: 365 }],
        serve: { variant: "on" },
      },
    ],
    overrides: [
      { targetingKey: "user-vip-007", variant: "on" },
      { targetingKey: "user-banned-42", variant: "off" },
    ],
  });

  // --- Semver gating: force-upgrade old app builds ---
  await call("POST", `${prod}/flags`, {
    key: "force-upgrade",
    type: "boolean",
    enabled: true,
    description: "Force an upgrade prompt for app builds below 3.0.0",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["mobile", "security"],
    owner: { name: "Margaret Hamilton", team: "Mobile" },
    rules: [
      {
        id: "outdated-builds",
        name: "appVersion < 3.0.0",
        conditions: [{ attribute: "appVersion", operator: "semverLessThan", value: "3.0.0" }],
        serve: { variant: "on" },
      },
    ],
  });

  // --- Date operator: target users who signed up before a cutoff ---
  await call("POST", `${prod}/flags`, {
    key: "loyalty-reward",
    type: "string",
    enabled: true,
    description: "Reward tier by signup date (date via ordering operators)",
    defaultVariant: "none",
    variants: {
      none: { value: "none", name: "No reward" },
      founder: { value: "founder", name: "Founder" },
    },
    fallthrough: { variant: "none" },
    tags: ["growth"],
    rules: [
      {
        id: "founders",
        name: "Signed up before 2025",
        conditions: [{ attribute: "signupAt", operator: "lessThan", value: "2025-01-01" }],
        serve: { variant: "founder" },
      },
    ],
  });

  // --- notInSegment + membership: beta open to all non-staff in select countries ---
  await call("POST", `${prod}/flags`, {
    key: "beta-program",
    type: "boolean",
    enabled: true,
    description: "Public beta — everyone except internal staff, in select countries",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["beta"],
    rules: [
      {
        id: "non-staff-countries",
        name: "Not internal staff, in FR/DE/ES/US",
        conditions: [
          { attribute: "", operator: "notInSegment", value: "internal-staff" },
          { attribute: "country", operator: "in", value: ["FR", "DE", "ES", "US"] },
        ],
        serve: { variant: "on" },
      },
      {
        id: "any-cohort",
        name: "In any cohort (multi-segment OR)",
        conditions: [
          { attribute: "", operator: "inSegment", value: ["eu-beta", "internal-staff"] },
        ],
        serve: { variant: "on" },
      },
    ],
  });

  // --- AND/OR/NOT condition groups: plan=pro AND (seats>25 OR role=admin) AND NOT region=test ---
  await call("POST", `${prod}/flags`, {
    key: "advanced-targeting",
    type: "boolean",
    enabled: true,
    description: "Demo of nested AND/OR/NOT condition groups in one rule",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["demo"],
    rules: [
      {
        id: "grouped",
        name: "pro AND (seats>25 OR role=admin) AND NOT region=test",
        conditions: [
          { attribute: "plan", operator: "equals", value: "pro" },
          {
            any: [
              { attribute: "seats", operator: "greaterThan", value: 25 },
              { attribute: "role", operator: "equals", value: "admin" },
            ],
          },
          { not: { any: [{ attribute: "region", operator: "equals", value: "test" }] } },
        ],
        serve: { variant: "on" },
      },
    ],
  });

  // --- Kitchen-sink: prerequisite + overrides + nested groups (with a matches
  // leaf inside an AND, and a regex-matches inside a NOT) + a weighted-split serve.
  await call("POST", `${prod}/flags`, {
    key: "enterprise-rollout",
    type: "boolean",
    enabled: true,
    description:
      "Everything at once: prereq, overrides, AND/OR/NOT groups, sift + regex matches, split serve",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["enterprise", "rollout", "experiment"],
    owner: { name: "Radia Perlman", email: "radia@example.com", team: "Platform" },
    expectedLifetimeDays: 60,
    prerequisites: [{ flagKey: "kill-switch", variant: "on" }],
    overrides: [
      { targetingKey: "user-design-partner", variant: "on" },
      { targetingKey: "user-churned-13", variant: "off" },
    ],
    rules: [
      {
        id: "power-cohort",
        name: "Eligible plan AND (new app OR big paid team) AND NOT a test account",
        conditions: [
          // top-level AND
          { attribute: "plan", operator: "in", value: ["pro", "enterprise", "beta"] },
          {
            any: [
              { attribute: "appVersion", operator: "semverGreaterThan", value: "4.0.0" },
              {
                all: [
                  { attribute: "seats", operator: "greaterThanOrEqual", value: 25 },
                  {
                    attribute: "",
                    operator: "matches",
                    matcher: "sift",
                    value: { $or: [{ region: "us" }, { region: "eu" }] },
                  },
                ],
              },
            ],
          },
          {
            not: {
              any: [
                {
                  attribute: "email",
                  operator: "matches",
                  matcher: "regex",
                  value: { pattern: "@test\\.", flags: "i" },
                },
              ],
            },
          },
        ],
        // gradual rollout among the matched cohort
        serve: {
          split: [
            { variant: "on", weight: 80 },
            { variant: "off", weight: 20 },
          ],
        },
      },
    ],
  });

  // --- Publish history (so Snapshots + the append-only Audit have content) ---
  await call("POST", `${prod}/publish`, {
    message: "Initial rollout: checkout, experiments, limits",
  });

  // a follow-up change + publish → v2
  await call("POST", `${prod}/flags`, {
    key: "winter-theme",
    type: "boolean",
    enabled: false,
    description: "Seasonal theme",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    tags: ["seasonal"],
  });
  await call("POST", `${prod}/publish`, { message: "Add winter-theme flag" });

  // roll back to v1 → audit keeps publish v1, publish v2, and the rollback (append-only)
  await call("POST", `${prod}/rollback`, { version: "v1", message: "Hold winter-theme for now" });

  // Backdate legacy-promo's timestamps via the draft so it reads as STALE. (upsertFlag
  // always stamps updatedAt=now, so a freshly-created flag is never idle; the draft
  // PUT path preserves whatever createdAt/updatedAt we provide.)
  const draft = (await call("GET", `${prod}/draft`)) as {
    flags: Record<string, { createdAt?: string; updatedAt?: string }>;
  };
  if (draft.flags["legacy-promo"]) {
    draft.flags["legacy-promo"].createdAt = daysAgo(140);
    draft.flags["legacy-promo"].updatedAt = daysAgo(120);
    await call("PUT", `${prod}/draft`, draft);
  }

  // --- Seed the `staging` environment so the env switcher is meaningful ---
  // (staging rolls new-checkout fully on; production keeps it gated above).
  const staging = envBase("default", "staging");
  await call("POST", `${staging}/flags`, {
    key: "new-checkout",
    type: "boolean",
    enabled: true,
    description: "Redesigned checkout — fully on in staging",
    defaultVariant: "on",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "on" },
    tags: ["checkout", "beta"],
    owner: { name: "Ada Lovelace", email: "ada@example.com", team: "Growth" },
  });
  await call("POST", `${staging}/publish`, { message: "Staging: checkout on for QA" });

  // --- A second project so the project switcher has somewhere to go ---
  await call("POST", `${envBase("billing", "production")}/flags`, {
    key: "usage-based-pricing",
    type: "boolean",
    enabled: false,
    description: "New metered billing",
    defaultVariant: "off",
    variants: { on: { value: true }, off: { value: false } },
    fallthrough: { variant: "off" },
    owner: { name: "Katherine Johnson", team: "Billing" },
  });
  await call("POST", `${envBase("billing", "production")}/publish`, {
    message: "Seed billing project",
  });

  console.log(`Done — ${okCount} API calls.`);
  console.log("");
  console.log("  Flags (default/production): new-checkout, banner-color (split), api-rate-limit,");
  console.log("    home-layout (json), kill-switch, premium-features (matches: sift+regex,");
  console.log("    overrides), force-upgrade (semver), loyalty-reward (date), beta-program");
  console.log("    (notInSegment), advanced-targeting (AND/OR/NOT groups), enterprise-rollout");
  console.log("    (kitchen-sink), legacy-promo (stale), old-banner (archived), winter-theme.");
  console.log("  Segments: eu-beta (inSegment), internal-staff (notInSegment).");
  console.log("  Prerequisite: new-checkout → kill-switch.");
  console.log("  Snapshots: v1, v2 · Audit: publish v1, publish v2, rollback → v1.");
  console.log("  Projects: default, billing · Environments: production, staging (both seeded).");
  console.log("  Test targeting: try attrs seats/plan/email/accountAgeDays/appVersion/signupAt.");
  console.log("");
  console.log(`  → open ${BASE}`);
}

if (import.meta.main) {
  seed().catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    console.error(`Is a server running at ${DEFAULT_BASE}? (try: bun run demo)`);
    process.exit(1);
  });
}
