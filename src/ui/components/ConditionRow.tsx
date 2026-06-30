import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Condition } from "../types.ts";
import { JsonCodeEditor } from "./JsonCodeEditor.tsx";
import { TextInput, Dropdown } from "./primitives.tsx";
import { TagInput } from "./TagInput.tsx";

/**
 * Operator options shown in the condition editor (shared by flags & segments),
 * ordered roughly by how often they're reached for — everyday equality/membership
 * first, presence + numeric in the middle, niche semver last.
 */
export const CONDITION_OPERATORS: { value: string; label: string }[] = [
  // Everyday
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "not equals" },
  { value: "in", label: "in (any of)" },
  { value: "notIn", label: "not in (any of)" },
  { value: "inSegment", label: "in segment" },
  { value: "notInSegment", label: "not in segment" },
  // Strings
  { value: "contains", label: "contains" },
  { value: "notContains", label: "not contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  // Presence
  { value: "exists", label: "exists" },
  { value: "notExists", label: "not exists" },
  // Numeric
  { value: "greaterThan", label: ">" },
  { value: "greaterThanOrEqual", label: ">=" },
  { value: "lessThan", label: "<" },
  { value: "lessThanOrEqual", label: "<=" },
  // Query documents (pluggable matcher: sift, regex, …)
  { value: "matches", label: "matches (query)" },
  { value: "notMatches", label: "not matches (query)" },
  // Version strings (niche)
  { value: "semverEquals", label: "semver =" },
  { value: "semverGreaterThan", label: "semver >" },
  { value: "semverLessThan", label: "semver <" },
];

export const NO_VALUE_OPS = new Set(["exists", "notExists"]);
export const COMMA_OPS = new Set(["in", "notIn"]);
export const MATCH_OPS = new Set(["matches", "notMatches"]);

const isObjectValue = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * A single condition editor row: attribute · operator · value. When the operator
 * is `inSegment` the value becomes a segment picker; `exists`/`notExists` hide it.
 */
export function ConditionRow({
  condition,
  onChange,
  onRemove,
  readonly,
  isFirst,
  segmentKeys = [],
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  readonly: boolean;
  isFirst: boolean;
  /** Available segment keys, used to populate the `inSegment` picker. */
  segmentKeys?: string[];
}) {
  const noValue = NO_VALUE_OPS.has(condition.operator);
  const isSegment = condition.operator === "inSegment" || condition.operator === "notInSegment";
  const isMatch = MATCH_OPS.has(condition.operator);

  // `matches`/`notMatches` edit a JSON query in a code editor. `draft` holds the
  // raw editor text (null → derive from the model); we only push a parsed value
  // up when it's valid JSON, surfacing an error otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const editorValue =
    draft ?? (isObjectValue(condition.value) ? JSON.stringify(condition.value, null, 2) : "");

  const handleJsonChange = (text: string) => {
    setDraft(text);
    if (text.trim() === "") {
      setJsonError(null);
      onChange({ ...condition, value: {} });
      return;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isObjectValue(parsed)) {
        setJsonError("Query must be a JSON object");
        return;
      }
      setJsonError(null);
      onChange({ ...condition, value: parsed });
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const valueStr =
    condition.value === undefined
      ? ""
      : Array.isArray(condition.value)
        ? (condition.value as string[]).join(", ")
        : String(condition.value);

  // Segment membership accepts one key or many (OR). Normalize the value to a list
  // for editing; write back a bare string for a single key (keeps it inlinable) and
  // an array for 2+. Keep unknown/dangling selections visible.
  const selectedSegments: string[] = Array.isArray(condition.value)
    ? (condition.value as unknown[]).filter((v): v is string => typeof v === "string" && !!v)
    : typeof condition.value === "string" && condition.value
      ? [condition.value]
      : [];
  const availableSegments = [...new Set(segmentKeys)].filter((k) => !selectedSegments.includes(k));
  const setSegments = (next: string[]) =>
    onChange({
      ...condition,
      attribute: "",
      value: next.length === 0 ? "" : next.length === 1 ? next[0]! : next,
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs font-medium uppercase text-muted-foreground">
        {isFirst ? "If" : "And"}
      </span>
      {isSegment ? (
        <span className="w-32 shrink-0 text-xs text-muted-foreground">
          {condition.operator === "notInSegment" ? "not member of" : "member of"}
        </span>
      ) : (
        <TextInput
          placeholder={isMatch ? "attribute (optional)" : "attribute"}
          value={condition.attribute}
          disabled={readonly}
          className="w-32 font-mono"
          onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
        />
      )}
      <Dropdown
        value={condition.operator}
        onValueChange={(op) => {
          const next: Condition = { ...condition, operator: op as Condition["operator"] };
          // Entering query mode: seed an object value + reset the editor draft.
          if (MATCH_OPS.has(op) && !isObjectValue(condition.value)) next.value = {};
          setDraft(null);
          setJsonError(null);
          onChange(next);
        }}
        options={CONDITION_OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
        disabled={readonly}
        className="w-36"
      />
      {isMatch ? (
        <>
          <TextInput
            placeholder="matcher (default)"
            value={condition.matcher ?? ""}
            disabled={readonly}
            className="w-28 font-mono"
            onChange={(e) => onChange({ ...condition, matcher: e.target.value || undefined })}
          />
          <div className="w-full">
            <JsonCodeEditor value={editorValue} onChange={handleJsonChange} readOnly={readonly} />
            {jsonError ? (
              <p className="mt-1 text-xs text-destructive">{jsonError}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                JSON query for the “{condition.matcher || "default"}” matcher
              </p>
            )}
          </div>
        </>
      ) : isSegment ? (
        <div className="flex min-w-36 flex-1 flex-wrap items-center gap-1.5">
          {selectedSegments.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-secondary/40 px-2 py-1 font-mono text-xs"
            >
              {key}
              {!readonly && (
                <button
                  type="button"
                  aria-label={`Remove ${key}`}
                  onClick={() => setSegments(selectedSegments.filter((k) => k !== key))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {selectedSegments.length > 1 && (
            <span className="text-xs text-muted-foreground">(any)</span>
          )}
          {!readonly && availableSegments.length > 0 ? (
            <Dropdown
              value=""
              placeholder={selectedSegments.length ? "add (or)…" : "select segment…"}
              onValueChange={(v) => v && setSegments([...selectedSegments, v])}
              options={availableSegments.map((k) => ({ value: k, label: k }))}
              className="w-40"
            />
          ) : selectedSegments.length === 0 ? (
            <span className="text-xs text-muted-foreground">no segments yet</span>
          ) : null}
        </div>
      ) : COMMA_OPS.has(condition.operator) ? (
        // `in` / `notIn` take a list — use a chip input (type + Enter) instead
        // of asking the user to type commas. Values are case-sensitive.
        <div className="min-w-36 flex-1">
          <TagInput
            values={Array.isArray(condition.value) ? (condition.value as string[]) : []}
            onChange={(vals) => onChange({ ...condition, value: vals })}
            disabled={readonly}
            placeholder="Add value…"
            lowercase={false}
          />
        </div>
      ) : !noValue ? (
        <TextInput
          placeholder="value"
          value={valueStr}
          disabled={readonly}
          className="w-36 font-mono"
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
        />
      ) : (
        <div className="w-36" />
      )}
      {!readonly && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove condition"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
