import React from "react";
import type { Condition, ConditionOperator } from "../types.ts";
import { Select, Input } from "./Button.tsx";
import { TrashIcon } from "./Icons.tsx";

const OPERATORS: { value: ConditionOperator; label: string; noValue?: boolean }[] = [
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "not equals" },
  { value: "in", label: "in (comma-sep)" },
  { value: "notIn", label: "not in (comma-sep)" },
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
  { value: "exists", label: "exists", noValue: true },
  { value: "notExists", label: "not exists", noValue: true },
];

const NO_VALUE_OPS = new Set<ConditionOperator>(["exists", "notExists"]);
const COMMA_OPS = new Set<ConditionOperator>(["in", "notIn"]);

interface Props {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  readonly?: boolean;
}

export function ConditionRow({ condition, onChange, onRemove, readonly }: Props) {
  const valueStr =
    condition.value === undefined
      ? ""
      : Array.isArray(condition.value)
        ? (condition.value as string[]).join(", ")
        : String(condition.value);

  const noValue = NO_VALUE_OPS.has(condition.operator);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr auto",
        gap: "6px",
        alignItems: "start",
      }}
    >
      <Input
        placeholder="attribute"
        value={condition.attribute}
        disabled={readonly}
        onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
        style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
      />
      <Select
        value={condition.operator}
        disabled={readonly}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </Select>
      {!noValue ? (
        <Input
          placeholder={COMMA_OPS.has(condition.operator) ? "a, b, c" : "value"}
          value={valueStr}
          disabled={readonly}
          onChange={(e) => {
            const raw = e.target.value;
            const v = COMMA_OPS.has(condition.operator) ? raw.split(",").map((s) => s.trim()) : raw;
            onChange({ ...condition, value: v });
          }}
          style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
        />
      ) : (
        <div />
      )}
      {!readonly && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-faint)",
            cursor: "pointer",
            padding: "4px",
            marginTop: "6px",
          }}
          aria-label="Remove condition"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
