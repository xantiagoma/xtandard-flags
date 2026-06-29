import React from "react";
import type { FlagType } from "../types.ts";

const typeColors: Record<FlagType, { bg: string; text: string; border: string }> = {
  boolean: {
    bg: "var(--color-accent-tint)",
    text: "var(--color-accent)",
    border: "var(--color-accent-border)",
  },
  string: {
    bg: "var(--color-info-tint)",
    text: "var(--color-info)",
    border: "var(--color-info-border)",
  },
  number: {
    bg: "var(--color-warning-tint)",
    text: "var(--color-warning)",
    border: "var(--color-warning-border)",
  },
  json: {
    bg: "var(--color-success-tint)",
    text: "var(--color-success)",
    border: "var(--color-success-border)",
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
            background: "var(--color-knob)",
            position: "absolute",
            top: "3px",
            left: enabled ? "17px" : "3px",
            transition: "left 0.15s",
            boxShadow: "var(--shadow-sm)",
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
      bg: "var(--color-success-tint)",
      text: "var(--color-success)",
      border: "var(--color-success-border)",
    },
    warning: {
      bg: "var(--color-warning-tint)",
      text: "var(--color-warning)",
      border: "var(--color-warning-border)",
    },
    danger: {
      bg: "var(--color-danger-tint)",
      text: "var(--color-danger)",
      border: "var(--color-danger-border)",
    },
    accent: {
      bg: "var(--color-accent-tint)",
      text: "var(--color-accent)",
      border: "var(--color-accent-border)",
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
