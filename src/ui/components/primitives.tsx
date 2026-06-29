import * as React from "react";
import { Switch } from "@base-ui-components/react/switch";
import { Select } from "@base-ui-components/react/select";
import { ToggleGroup } from "@base-ui-components/react/toggle-group";
import { Toggle } from "@base-ui-components/react/toggle";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils.ts";

/* ─── ToggleSwitch ──────────────────────────────────────────────────────────── */

export function ToggleSwitch({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors",
        "bg-input data-[checked]:bg-success",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <Switch.Thumb className="size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-[18px]" />
    </Switch.Root>
  );
}

/* ─── Segmented ─────────────────────────────────────────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  "aria-label"?: string;
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: "sm" | "md";
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(groupValue: string[]) => {
        const next = groupValue.find((v) => v !== value) ?? groupValue[0];
        if (next) onValueChange(next as T);
      }}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary/50 p-0.5"
    >
      {options.map((opt) => (
        <Toggle
          key={opt.value}
          value={opt.value}
          aria-label={opt["aria-label"]}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium text-muted-foreground outline-none transition-colors",
            "hover:text-foreground",
            "data-[pressed]:bg-card data-[pressed]:text-foreground data-[pressed]:shadow-sm",
            "focus-visible:ring-2 focus-visible:ring-ring",
            size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
          )}
        >
          {opt.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/* ─── Dropdown ──────────────────────────────────────────────────────────────── */

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

export function Dropdown({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(v) => onValueChange(v as string)}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-secondary/40 px-3 text-[13px] text-foreground outline-none transition-colors",
          "hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-ring",
          className,
        )}
      >
        <Select.Value className="truncate">
          {(val: string) => {
            const found = options.find((o) => o.value === val);
            return found ? (
              found.label
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            );
          }}
        </Select.Value>
        <Select.Icon>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} className="z-50 outline-none" alignItemWithTrigger={false}>
          <Select.Popup
            className={cn(
              "max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none",
              "origin-[var(--transform-origin)] transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
          >
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  "flex cursor-pointer select-none items-start gap-2 rounded-md py-1.5 pl-2 pr-2 text-[13px] outline-none",
                  "data-[highlighted]:bg-accent/15 data-[highlighted]:text-foreground",
                )}
              >
                <span className="flex w-4 shrink-0 items-center justify-center pt-0.5">
                  <Select.ItemIndicator>
                    <Check className="size-3.5 text-accent" />
                  </Select.ItemIndicator>
                </span>
                <span className="flex flex-col">
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  {opt.description ? (
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  ) : null}
                </span>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/* ─── TextInput ─────────────────────────────────────────────────────────────── */

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-secondary/40 px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground",
        "hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

/* ─── TextArea ──────────────────────────────────────────────────────────────── */

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-input bg-secondary/40 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground",
        "hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
