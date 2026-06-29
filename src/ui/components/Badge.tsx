import React from "react";
import type { FlagType } from "../types.ts";

const typeColors: Record<FlagType, { bg: string; text: string; border: string }> = {
  boolean: {
    bg: "rgba(124,106,247,0.12)",
    text: "#a594f9",
    border: "rgba(124,106,247,0.25)",
  },
  string: {
    bg: "rgba(56,189,248,0.1)",
    text: "#38bdf8",
    border: "rgba(56,189,248,0.2)",
  },
  number: {
    bg: "rgba(245,158,11,0.1)",
    text: "#f59e0b",
    border: "rgba(245,158,11,0.2)",
  },
  json: {
    bg: "rgba(34,197,94,0.1)",
    text: "#22c55e",
    border: "rgba(34,197,94,0.2)",
  },
};

export function TypeBadge({ type }: { type: FlagType }) {
  const c = typeColors[type];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        borderRadius: "4px",
        padding: "1px 7px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        fontFamily: "var(--font-mono)",
        lineHeight: "1.6",
      }}
    >
      {type}
    </span>
  );
}

export function StatusBadge({
  enabled,
  readonly,
  onChange,
}: {
  enabled: boolean;
  readonly?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const handleClick = () => {
    if (!readonly && onChange) onChange(!enabled);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!readonly && onChange && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      onChange(!enabled);
    }
  };

  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Disable flag" : "Enable flag"}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={readonly}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: readonly ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        opacity: readonly ? 0.6 : 1,
      }}
    >
      <span
        style={{
          width: "32px",
          height: "18px",
          borderRadius: "9px",
          background: enabled ? "var(--color-accent)" : "var(--color-border-strong)",
          position: "relative",
          transition: "background 0.15s",
          display: "block",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: "3px",
            left: enabled ? "17px" : "3px",
            transition: "left 0.15s",
          }}
        />
      </span>
    </button>
  );
}

export function Pill({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "accent";
}) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    default: {
      bg: "var(--color-elevated)",
      text: "var(--color-muted)",
      border: "var(--color-border)",
    },
    success: {
      bg: "rgba(34,197,94,0.1)",
      text: "#22c55e",
      border: "rgba(34,197,94,0.2)",
    },
    warning: {
      bg: "rgba(245,158,11,0.1)",
      text: "#f59e0b",
      border: "rgba(245,158,11,0.2)",
    },
    danger: {
      bg: "rgba(239,68,68,0.1)",
      text: "#ef4444",
      border: "rgba(239,68,68,0.2)",
    },
    accent: {
      bg: "rgba(124,106,247,0.12)",
      text: "#a594f9",
      border: "rgba(124,106,247,0.25)",
    },
  };

  const s = styles[variant] ?? styles["default"]!;
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        borderRadius: "var(--radius-sm)",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 500,
        letterSpacing: "0.02em",
        lineHeight: "1.6",
      }}
    >
      {children}
    </span>
  );
}
