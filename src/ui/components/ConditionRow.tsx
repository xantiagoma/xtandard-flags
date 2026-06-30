import React from "react";
import { Trash2 } from "lucide-react";
import type { Condition } from "../types.ts";
import { TextInput, Dropdown } from "./primitives.tsx";
import { TagInput } from "./TagInput.tsx";

/** Operator options shown in the condition editor (shared by flags & segments). */
export const CONDITION_OPERATORS: { value: string; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "not equals" },
  { value: "in", label: "in (any of)" },
  { value: "notIn", label: "not in (any of)" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "not contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "greaterThan", label: ">" },
  { value: "greaterThanOrEqual", label: ">=" },
  { value: "lessThan", label: "<" },
  { value: "lessThanOrEqual", label: "<=" },
  { value: "semverEquals", label: "semver =" },
  { value: "semverGreaterThan", label: "semver >" },
  { value: "semverLessThan", label: "semver <" },
  { value: "exists", label: "exists" },
  { value: "notExists", label: "not exists" },
  { value: "inSegment", label: "in segment" },
];

export const NO_VALUE_OPS = new Set(["exists", "notExists"]);
export const COMMA_OPS = new Set(["in", "notIn"]);

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
  const isSegment = condition.operator === "inSegment";
  const valueStr =
    condition.value === undefined
      ? ""
      : Array.isArray(condition.value)
        ? (condition.value as string[]).join(", ")
        : String(condition.value);

  // Include the current value so an existing/dangling reference still renders.
  const currentSegment = typeof condition.value === "string" ? condition.value : "";
  const segmentOptions = [...new Set([...segmentKeys, currentSegment].filter(Boolean))].map(
    (k) => ({
      value: k,
      label: k,
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs font-medium uppercase text-muted-foreground">
        {isFirst ? "If" : "And"}
      </span>
      {isSegment ? (
        <span className="w-32 shrink-0 text-xs text-muted-foreground">member of</span>
      ) : (
        <TextInput
          placeholder="attribute"
          value={condition.attribute}
          disabled={readonly}
          className="w-32 font-mono"
          onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
        />
      )}
      <Dropdown
        value={condition.operator}
        onValueChange={(op) => onChange({ ...condition, operator: op as Condition["operator"] })}
        options={CONDITION_OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
        disabled={readonly}
        className="w-36"
      />
      {isSegment ? (
        segmentOptions.length > 0 ? (
          <Dropdown
            value={currentSegment}
            onValueChange={(v) => onChange({ ...condition, attribute: "", value: v })}
            options={segmentOptions}
            disabled={readonly}
            className="w-36"
          />
        ) : (
          <span className="w-36 text-xs text-muted-foreground">no segments yet</span>
        )
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
