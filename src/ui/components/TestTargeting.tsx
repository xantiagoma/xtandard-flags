import React, { useState } from "react";
import { Play } from "lucide-react";
import { evaluate, type EvaluationResult } from "../api.ts";
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
  ERROR: "border-destructive/40 bg-destructive/10 text-destructive",
  FLAG_NOT_FOUND: "border-destructive/40 bg-destructive/10 text-destructive",
};

let nextId = 1;

/**
 * Test how this flag resolves for a given evaluation context. Evaluates the saved
 * draft on the server (same evaluator the runtime uses), so save edits first.
 */
export function TestTargeting({
  flagKey,
  projectKey,
  environmentKey,
}: {
  flagKey: string;
  projectKey: string;
  environmentKey: string;
}) {
  const [targetingKey, setTargetingKey] = useState("user-123");
  const [attrs, setAttrs] = useState<Attr[]>([{ id: 0, key: "country", value: "CO" }]);
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
        flagKey,
        source: "draft",
      });
      setResult(res.results[0] ?? null);
    } catch {
      setError("Evaluation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Targeting key</span>
          <TextInput
            value={targetingKey}
            onChange={(e) => setTargetingKey(e.target.value)}
            placeholder="user-123"
            className="font-mono"
          />
        </label>
      </div>

      <p className="mb-1.5 mt-4 text-[13px] font-medium">Attributes</p>
      <div className="space-y-2">
        {attrs.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <TextInput
              value={a.key}
              placeholder="attribute"
              className="font-mono"
              onChange={(e) =>
                setAttrs((prev) =>
                  prev.map((x) => (x.id === a.id ? { ...x, key: e.target.value } : x)),
                )
              }
            />
            <TextInput
              value={a.value}
              placeholder="value"
              className="font-mono"
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
              ×
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAttrs((prev) => [...prev, { id: nextId++, key: "", value: "" }])}
        >
          + Add attribute
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={run} disabled={loading}>
          <Play className="size-3.5" />
          {loading ? "Evaluating…" : "Test"}
        </Button>
        {result && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Serves</span>
            <code className="rounded-md bg-secondary/60 px-2 py-0.5 font-mono text-foreground">
              {JSON.stringify(result.value)}
            </code>
            {result.variant && <span className="text-muted-foreground">via {result.variant}</span>}
            <Badge className={cn(reasonTone[result.reason] ?? reasonTone.DEFAULT)}>
              {result.reason}
            </Badge>
          </div>
        )}
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Evaluates the saved draft with the same engine your runtime uses. Save changes first to test
        edits.
      </p>
    </div>
  );
}
