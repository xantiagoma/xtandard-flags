import React, { useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import type { FlagType } from "../types.ts";
import { Button } from "../components/ui-bits.tsx";
import { TextInput } from "../components/primitives.tsx";
import { cn } from "../lib/utils.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (key: string, type: FlagType) => void;
}

const TYPE_OPTIONS: { value: FlagType; label: string; desc: string }[] = [
  { value: "boolean", label: "boolean", desc: "on / off toggle" },
  { value: "string", label: "string", desc: "text variants" },
  { value: "number", label: "number", desc: "numeric variants" },
  { value: "json", label: "json", desc: "structured variants" },
];

export function CreateFlagModal({ open, onClose, onCreate }: Props) {
  const [key, setKey] = useState("");
  const [type, setType] = useState<FlagType>("boolean");
  const [error, setError] = useState("");

  const handleClose = () => {
    setKey("");
    setType("boolean");
    setError("");
    onClose();
  };

  const handleCreate = () => {
    if (!key.trim()) {
      setError("Key is required");
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      setError("Only letters, digits, periods, underscores, and hyphens allowed");
      return;
    }
    onCreate(key.trim(), type);
    handleClose();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="border-b border-border px-5 py-4">
            <Dialog.Title className="text-[15px] font-semibold text-foreground">
              New flag
            </Dialog.Title>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-[13px] text-muted-foreground">
              Choose a unique key and type. You'll configure variants, rules, and targeting in the
              editor.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="flag-key" className="text-[13px] font-medium">
                Key
              </label>
              <TextInput
                id="flag-key"
                value={key}
                placeholder="my.feature-flag_v2"
                className={cn("font-mono", error && "border-destructive")}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") handleClose();
                }}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      type === opt.value
                        ? "border-ring bg-secondary/60 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50",
                    )}
                  >
                    <span className="font-mono text-[13px] font-semibold">{opt.label}</span>
                    <span className="text-xs opacity-70">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              Continue to editor
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
