import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--color-accent)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  secondary: {
    background: "var(--color-elevated)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-muted)",
    border: "1px solid transparent",
  },
  danger: {
    background: "rgba(239,68,68,0.1)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.25)",
  },
};

const hoverVariants: Record<Variant, React.CSSProperties> = {
  primary: { background: "#6a58e8" },
  secondary: { background: "#252532", borderColor: "var(--color-border-strong)" },
  ghost: { background: "var(--color-elevated)", color: "var(--color-text)" },
  danger: { background: "rgba(239,68,68,0.18)" },
};

const sizes: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "12px", padding: "4px 10px", height: "28px" },
  md: { fontSize: "13px", padding: "6px 14px", height: "34px" },
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "background 0.12s, border-color 0.12s, color 0.12s",
    lineHeight: 1,
    userSelect: "none",
    whiteSpace: "nowrap",
    ...variants[variant],
    ...sizes[size],
    ...(hovered && !disabled ? hoverVariants[variant] : {}),
    ...style,
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={base}
      onMouseEnter={(e) => {
        setHovered(true);
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        props.onMouseLeave?.(e);
      }}
    >
      {loading ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ animation: "spin 0.8s linear infinite" }}
        >
          <circle
            cx="7"
            cy="7"
            r="5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="20"
            strokeDashoffset="10"
            strokeLinecap="round"
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); transform-origin: 50% 50%; } }`}</style>
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  const id = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {label && (
        <label
          htmlFor={id}
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
      <input
        id={id}
        {...props}
        style={{
          background: "var(--color-elevated)",
          border: `1px solid ${error ? "#ef4444" : "var(--color-border-strong)"}`,
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text)",
          fontSize: "13px",
          padding: "6px 10px",
          height: "32px",
          fontFamily: "var(--font-sans)",
          width: "100%",
          outline: "none",
          transition: "border-color 0.1s",
          ...style,
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error
            ? "#ef4444"
            : "var(--color-border-strong)";
          props.onBlur?.(e);
        }}
      />
      {error && <span style={{ fontSize: "11px", color: "#ef4444" }}>{error}</span>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, children, style, ...props }: SelectProps) {
  const id = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {label && (
        <label
          htmlFor={id}
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
      <select
        id={id}
        {...props}
        style={{
          background: "var(--color-elevated)",
          border: `1px solid ${error ? "#ef4444" : "var(--color-border-strong)"}`,
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text)",
          fontSize: "13px",
          padding: "6px 10px",
          height: "32px",
          fontFamily: "var(--font-sans)",
          width: "100%",
          outline: "none",
          cursor: "pointer",
          ...style,
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error
            ? "#ef4444"
            : "var(--color-border-strong)";
          props.onBlur?.(e);
        }}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: "11px", color: "#ef4444" }}>{error}</span>}
    </div>
  );
}

export function Textarea({
  label,
  error,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
}) {
  const id = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {label && (
        <label
          htmlFor={id}
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
      <textarea
        id={id}
        {...props}
        style={{
          background: "var(--color-elevated)",
          border: `1px solid ${error ? "#ef4444" : "var(--color-border-strong)"}`,
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text)",
          fontSize: "13px",
          padding: "8px 10px",
          fontFamily: "var(--font-mono)",
          width: "100%",
          resize: "vertical",
          outline: "none",
          minHeight: "80px",
          transition: "border-color 0.1s",
          lineHeight: 1.5,
          ...style,
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = error
            ? "#ef4444"
            : "var(--color-border-strong)";
          props.onBlur?.(e);
        }}
      />
      {error && <span style={{ fontSize: "11px", color: "#ef4444" }}>{error}</span>}
    </div>
  );
}
