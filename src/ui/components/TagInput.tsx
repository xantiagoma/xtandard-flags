import React, { useState } from "react";
import { X } from "lucide-react";
import { TextInput } from "./primitives.tsx";

/** Edit a list of free-form tags. Enter or comma adds; backspace on empty removes last. */
export function TagInput({
  values,
  onChange,
  placeholder = "Add tag…",
  disabled,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-0.5 text-[12px] text-muted-foreground"
        >
          {t}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(values.filter((v) => v !== t))}
              className="text-muted-foreground/60 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <TextInput
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          className="h-7 w-28 flex-1 min-w-28"
        />
      )}
    </div>
  );
}
