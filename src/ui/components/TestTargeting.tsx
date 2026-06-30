import React, { useMemo, useState } from "react";
import { Play, Plus, X } from "lucide-react";
import { evaluate, type EvaluationResult } from "../api.ts";
import type { Flag } from "../types.ts";
import { leafConditions } from "../types.ts";
import { Button, Badge } from "./ui-bits.tsx";
import { TextInput } from "./primitives.tsx";
import { cn } from "../lib/utils.ts";

interface Attr {
  id: number;
  key: string;
  value: string;
}

const reasonTone: Record<string, string> = {
  TARGETING_MATCH: "border-accent/40 bg-accent/10 text-accent",
  SPLIT: "border-accent/40 bg-accent/10 text-accent",
  STATIC: "border-success/40 bg-success/10 text-success",
  DEFAULT: "border-border bg-secondary/60 text-muted-foreground",
  DISABLED: "border-warning/40 bg-warning/10 text-warning",
  PREREQUISITE_FAILED: "border-warning/40 bg-warning/10 text-warning",
  ERROR: "border-destructive/40 bg-destructive/10 text-destructive",
  FLAG_NOT_FOUND: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Plain-language explanation of each evaluation reason. */
const reasonHelp: Record<string, string> = {
  TARGETING_MATCH: "A targeting rule matched this context.",
  SPLIT: "Assigned by a weighted split — deterministic for this targeting key.",
  STATIC: "Served by the fallthrough (no rule matched, or a fixed serve).",
  DEFAULT: "No rule matched — the default variant was served.",
  DISABLED: "The flag is disabled — it serves its default variant.",
  PREREQUISITE_FAILED: "A prerequisite flag wasn't satisfied — default variant.",
  ERROR: "Evaluation error — check the flag's configuration.",
  FLAG_NOT_FOUND: "Not in the saved draft yet. Save the flag, then test.",
};

let nextId = 1;

/**
 * Test how this flag resolves for a given evaluation context. Evaluates the saved
 * draft on the server (the same evaluator the runtime uses). Attribute rows are
 * seeded from the attributes this flag's rules actually read, so it's clear what
 * to fill in.
 */
export function TestTargeting({
  flag,
  isDirty,
  projectKey,
  environmentKey,
}: {
  flag: Flag;
  isDirty: boolean;
  projectKey: string;
  environmentKey: string;
}) {
  // Attributes this flag's rules reference — the useful things to test against.
  const ruleAttrs = useMemo(() => {
    const keys = new Set<string>();
    for (const rule of flag.rules ?? []) {
      for (const c of leafConditions(rule.conditions)) {
        if (c.attribute && c.operator !== "inSegment" && c.operator !== "notInSegment") {
          keys.add(c.attribute);
        }
      }
    }
    return [...keys];
  }, [flag.rules]);

  const [targetingKey, setTargetingKey] = useState("user-123");
  // Seed one row per referenced attribute (empty value to fill in), else a blank row.
  const [attrs, setAttrs] = useState<Attr[]>(() =>
    ruleAttrs.length > 0
      ? ruleAttrs.map((key) => ({ id: nextId++, key, value: "" }))
      : [{ id: nextId++, key: "", value: "" }],
  );
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function buildContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = {};
    if (targetingKey.trim()) ctx.targetingKey = targetingKey.trim();
    for (const a of attrs) {
      if (!a.key.trim()) continue;
      // Coerce obvious primitives so numeric/boolean conditions work as expected.
      const v = a.value;
      ctx[a.key.trim()] =
        v === "true" ? true : v === "false" ? false : v !== "" && !isNaN(Number(v)) ? Number(v) : v;
    }
    return ctx;
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await evaluate(projectKey, environmentKey, buildContext(), {
        flagKey: flag.key,
        source: "draft",
      });
      setResult(res.results[0] ?? null);
    } catch {
      setError("Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  const addRow = () => setAttrs((prev) => [...prev, { id: nextId++, key: "", value: "" }]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">
        Enter an example user context and run it through the evaluator — the same one your runtime
        uses — to see which variant this flag would serve and why.
      </p>

      {isDirty && (
        <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          You have unsaved edits. This tests the <strong>last saved</strong> version — save changes
          to test what's on screen.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Targeting key</span>
          <TextInput
            value={targetingKey}
            onChange={(e) => setTargetingKey(e.target.value)}
            placeholder="user-123"
            className="font-mono"
          />
          <span className="text-xs text-muted-foreground">
            Identifies the user — drives % rollouts / splits and matches overrides.
          </span>
        </label>
      </div>

      <div className="mb-1.5 mt-4 flex items-center gap-2">
        <span className="text-[13px] font-medium">Attributes</span>
        {ruleAttrs.length > 0 && (
          <span className="text-xs text-muted-foreground">
            (seeded from this flag's rules — fill in values)
          </span>
        )}
      </div>
      <div className="space-y-2">
        {attrs.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <TextInput
              value={a.key}
              placeholder="attribute"
              className="w-40 font-mono"
              onChange={(e) =>
                setAttrs((prev) =>
                  prev.map((x) => (x.id === a.id ? { ...x, key: e.target.value } : x)),
                )
              }
            />
            <TextInput
              value={a.value}
              placeholder="value"
              className="flex-1 font-mono"
              onChange={(e) =>
                setAttrs((prev) =>
                  prev.map((x) => (x.id === a.id ? { ...x, value: e.target.value } : x)),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove attribute"
              onClick={() => setAttrs((prev) => prev.filter((x) => x.id !== a.id))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={addRow}>
          Add attribute
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={run} disabled={loading}>
          <Play className="size-3.5" />
          {loading ? "Evaluating…" : "Test"}
        </Button>
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>

      {result && (
        <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Serves</span>
            <code className="rounded-md bg-secondary/60 px-2 py-0.5 font-mono text-foreground">
              {JSON.stringify(result.value)}
            </code>
            {result.variant && (
              <span className="text-muted-foreground">
                via variant <code className="font-mono text-foreground">{result.variant}</code>
              </span>
            )}
            <Badge className={cn(reasonTone[result.reason] ?? reasonTone.DEFAULT)}>
              {result.reason}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {reasonHelp[result.reason] ?? "How this flag resolved for the context above."}
          </p>
        </div>
      )}
    </div>
  );
}
