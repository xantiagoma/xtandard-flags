import React, { useState } from "react";
import { getThemePref, setThemePref, type ThemePref } from "../theme.ts";

const Monitor = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
const Sun = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System theme", icon: <Monitor /> },
  { value: "light", label: "Light theme", icon: <Sun /> },
  { value: "dark", label: "Dark theme", icon: <Moon /> },
];

/** Segmented system/light/dark switch. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => getThemePref());

  const choose = (value: ThemePref) => {
    setPref(value);
    setThemePref(value);
  };

  return (
    <div
      role="group"
      aria-label="Theme"
      style={{
        display: "inline-flex",
        padding: "2px",
        gap: "2px",
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = pref === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            onClick={() => choose(opt.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "24px",
              border: "none",
              cursor: "pointer",
              borderRadius: "7px",
              background: active ? "var(--color-surface)" : "transparent",
              color: active ? "var(--color-accent)" : "var(--color-faint)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "color 0.12s, background 0.12s",
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
