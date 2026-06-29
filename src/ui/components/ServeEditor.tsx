import React from "react";
import type { Serve } from "../types.ts";
import { Button, Input, Select } from "./Button.tsx";
import { TrashIcon, PlusIcon } from "./Icons.tsx";

interface ServeEditorProps {
  value: Serve;
  onChange: (v: Serve) => void;
  variantKeys: string[];
  readonly?: boolean;
  label?: string;
}

export function ServeEditor({ value, onChange, variantKeys, readonly, label }: ServeEditorProps) {
  const isFixed = "variant" in value;
  const isSplit = "split" in value;

  const id = React.useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {label && (
        <label
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--color-muted)",
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </label>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          disabled={readonly}
          onClick={() => {
            if (!isFixed) onChange({ variant: variantKeys[0] ?? "" });
          }}
          style={{
            flex: 1,
            padding: "5px 10px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${isFixed ? "var(--color-accent)" : "var(--color-border)"}`,
            background: isFixed ? "var(--color-accent-dim)" : "var(--color-elevated)",
            color: isFixed ? "var(--color-accent-light)" : "var(--color-muted)",
            cursor: readonly ? "default" : "pointer",
          }}
        >
          Fixed variant
        </button>
        <button
          type="button"
          disabled={readonly}
          onClick={() => {
            if (!isSplit) {
              onChange({
                split: variantKeys.slice(0, 2).map((v, i) => ({
                  variant: v,
                  weight: i === 0 ? 50 : 50,
                })),
              });
            }
          }}
          style={{
            flex: 1,
            padding: "5px 10px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${isSplit ? "var(--color-accent)" : "var(--color-border)"}`,
            background: isSplit ? "var(--color-accent-dim)" : "var(--color-elevated)",
            color: isSplit ? "var(--color-accent-light)" : "var(--color-muted)",
            cursor: readonly ? "default" : "pointer",
          }}
        >
          Weighted split
        </button>
      </div>

      {isFixed && (
        <Select
          value={(value as { variant: string }).variant}
          disabled={readonly}
          onChange={(e) => onChange({ variant: e.target.value })}
        >
          {variantKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      )}

      {isSplit && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {(value as { split: { variant: string; weight: number }[] }).split.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <Select
                value={row.variant}
                disabled={readonly}
                style={{ flex: 2 }}
                onChange={(e) => {
                  const split = [
                    ...(value as { split: { variant: string; weight: number }[] }).split,
                  ];
                  split[i] = { ...split[i]!, variant: e.target.value };
                  onChange({ split });
                }}
              >
                {variantKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={row.weight}
                  disabled={readonly}
                  onChange={(e) => {
                    const split = [
                      ...(value as { split: { variant: string; weight: number }[] }).split,
                    ];
                    split[i] = { ...split[i]!, weight: Number(e.target.value) };
                    onChange({ split });
                  }}
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--color-text)",
                    fontSize: "13px",
                    padding: "5px 8px",
                    height: "32px",
                    width: "70px",
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--color-faint)" }}>%</span>
              </div>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => {
                    const split = (
                      value as { split: { variant: string; weight: number }[] }
                    ).split.filter((_, j) => j !== i);
                    onChange({ split });
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-faint)",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
          {!readonly && (
            <Button
              size="sm"
              variant="ghost"
              icon={<PlusIcon />}
              onClick={() => {
                const split = [
                  ...(value as { split: { variant: string; weight: number }[] }).split,
                  { variant: variantKeys[0] ?? "", weight: 0 },
                ];
                onChange({ split });
              }}
            >
              Add variant
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
