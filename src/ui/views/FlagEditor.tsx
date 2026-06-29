import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Flag, FlagType, Rule, Condition, Serve, Variant } from "../types.ts";
import { FlagsApiError } from "../types.ts";
import { createFlag, updateFlag } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { Button, Input, Select, Textarea } from "../components/Button.tsx";
import { StatusBadge } from "../components/Badge.tsx";
import { ServeEditor } from "../components/ServeEditor.tsx";
import { ConditionRow } from "../components/ConditionEditor.tsx";
import {
  CloseIcon,
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "../components/Icons.tsx";

interface Props {
  flag: Flag | null; // null = create mode
  /** In create mode, the initial flag seeded from the "New flag" modal (key + type + variants). */
  seed?: Flag | null;
  open: boolean;
  onClose: () => void;
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
}

function defaultVariants(type: FlagType): Record<string, Variant> {
  switch (type) {
    case "boolean":
      return { on: { value: true }, off: { value: false } };
    case "string":
      return { control: { value: "control" }, treatment: { value: "treatment" } };
    case "number":
      return { zero: { value: 0 }, one: { value: 1 } };
    case "json":
      return { control: { value: {} }, treatment: { value: {} } };
  }
}

function defaultFallthrough(type: FlagType): Serve {
  switch (type) {
    case "boolean":
      return { variant: "off" };
    default:
      return { variant: "control" };
  }
}

function emptyFlag(type: FlagType): Flag {
  const variants = defaultVariants(type);
  const defaultVariant = Object.keys(variants)[0] ?? "off";
  return {
    key: "",
    type,
    enabled: false,
    description: "",
    defaultVariant,
    variants,
    rules: [],
    overrides: [],
    fallthrough: defaultFallthrough(type),
  };
}

function newRule(): Rule {
  return {
    id: crypto.randomUUID(),
    name: "",
    conditions: [{ attribute: "", operator: "equals", value: "" }],
    serve: { variant: "" },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3
        style={{
          margin: 0,
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-faint)",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function VariantValueInput({
  type,
  value,
  onChange,
  disabled,
}: {
  type: FlagType;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  if (type === "boolean") {
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }
  if (type === "number") {
    return (
      <input
        type="number"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "var(--color-elevated)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text)",
          fontSize: "13px",
          padding: "5px 8px",
          height: "32px",
          fontFamily: "var(--font-mono)",
          width: "100%",
        }}
      />
    );
  }
  if (type === "json") {
    const jsonStr = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return (
      <Textarea
        value={jsonStr}
        disabled={disabled}
        rows={3}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
        style={{ fontSize: "12px" }}
      />
    );
  }
  return (
    <Input
      value={String(value ?? "")}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
    />
  );
}

export function FlagEditor({
  flag,
  seed,
  open,
  onClose,
  projectKey,
  environmentKey,
  readonly,
}: Props) {
  const isCreate = flag === null;
  const drawerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const qc = useQueryClient();

  // Edit → the existing flag; create → the modal seed (key + type), else a blank.
  const initialFlag = () => flag ?? seed ?? emptyFlag("boolean");
  const [form, setForm] = useState<Flag>(initialFlag);
  const [keyError, setKeyError] = useState<string>("");
  const [apiErrors, setApiErrors] = useState<{ path?: string; message: string }[]>([]);

  useEffect(() => {
    if (open) {
      setForm(flag ?? seed ?? emptyFlag("boolean"));
      setKeyError("");
      setApiErrors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flag, seed]);

  useEffect(() => {
    if (!open) return;
    const el = drawerRef.current;
    const prev = document.activeElement as HTMLElement | null;
    el?.focus();
    return () => {
      prev?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const mutation = useMutation({
    mutationFn: () => {
      if (isCreate) return createFlag(projectKey, environmentKey, form);
      return updateFlag(projectKey, environmentKey, form.key, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["flags", projectKey, environmentKey],
      });
      toast.add("success", isCreate ? "Flag created" : "Flag updated");
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof FlagsApiError) {
        setApiErrors(err.body.errors ?? []);
        toast.add("error", err.body.error, err.body.errors?.[0]?.message);
      } else {
        toast.add("error", "Something went wrong");
      }
    },
  });

  const variantKeys = Object.keys(form.variants);

  const patch = <K extends keyof Flag>(k: K, v: Flag[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const updateVariant = (key: string, v: Partial<Variant>) => {
    const existing = form.variants[key] ?? { value: undefined };
    const updated: Variant = { ...existing, ...v };
    patch("variants", { ...form.variants, [key]: updated });
  };

  const removeVariant = (key: string) => {
    const next = { ...form.variants };
    delete next[key];
    patch("variants", next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreate && !form.key) {
      setKeyError("Key is required");
      return;
    }
    if (isCreate && !/^[a-zA-Z0-9._-]+$/.test(form.key)) {
      setKeyError("Key must match ^[a-zA-Z0-9._-]+$");
      return;
    }
    setKeyError("");
    mutation.mutate();
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 500,
          backdropFilter: "blur(1px)",
        }}
      />
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={isCreate ? "Create flag" : `Edit ${form.key}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(620px, 94vw)",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border-strong)",
          zIndex: 600,
          display: "flex",
          flexDirection: "column",
          outline: "none",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-faint)",
                marginBottom: "2px",
              }}
            >
              {isCreate ? "New flag" : "Edit flag"}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--color-text)",
                fontFamily: isCreate ? undefined : "var(--font-mono)",
                letterSpacing: isCreate ? undefined : "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isCreate ? form.key || "Untitled flag" : form.key}
            </p>
          </div>
          {!isCreate && !readonly && (
            <StatusBadge enabled={form.enabled} onChange={(v) => patch("enabled", v)} />
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "var(--color-faint)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}
        >
          <div
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              flex: 1,
            }}
          >
            {/* Basics */}
            <Section title="Basics">
              {isCreate && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Input
                    label="Key *"
                    value={form.key}
                    placeholder="my-feature-flag"
                    onChange={(e) => {
                      patch("key", e.target.value);
                      setKeyError("");
                    }}
                    error={keyError}
                    style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                  />
                  <Select
                    label="Type"
                    value={form.type}
                    onChange={(e) => {
                      const t = e.target.value as FlagType;
                      const variants = defaultVariants(t);
                      const defaultVariant = Object.keys(variants)[0] ?? "";
                      setForm((f) => ({
                        ...f,
                        type: t,
                        variants,
                        defaultVariant,
                        fallthrough: defaultFallthrough(t),
                      }));
                    }}
                  >
                    <option value="boolean">boolean</option>
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="json">json</option>
                  </Select>
                </div>
              )}
              <Input
                label="Description"
                value={form.description ?? ""}
                disabled={readonly}
                placeholder="What does this flag control?"
                onChange={(e) => patch("description", e.target.value)}
              />
              {!isCreate && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-muted)" }}>
                    Enabled
                  </span>
                  <StatusBadge
                    enabled={form.enabled}
                    readonly={readonly}
                    onChange={(v) => patch("enabled", v)}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: form.enabled ? "var(--color-success)" : "var(--color-faint)",
                    }}
                  >
                    {form.enabled ? "Active" : "Off"}
                  </span>
                </div>
              )}
            </Section>

            {/* Variants */}
            <Section title="Variants">
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {Object.entries(form.variants).map(([key, variant]) => (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr 200px auto",
                      gap: "8px",
                      alignItems: "start",
                      padding: "8px 10px",
                      background: "var(--color-elevated)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-accent-light)",
                        fontWeight: 600,
                        paddingTop: "7px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {key}
                    </div>
                    <div>
                      <VariantValueInput
                        type={form.type}
                        value={variant.value}
                        disabled={readonly || form.type === "boolean"}
                        onChange={(v) => updateVariant(key, { value: v })}
                      />
                    </div>
                    <Input
                      placeholder="Display name (optional)"
                      value={variant.name ?? ""}
                      disabled={readonly}
                      onChange={(e) => updateVariant(key, { name: e.target.value })}
                      style={{ fontSize: "12px" }}
                    />
                    {!readonly && form.type !== "boolean" && (
                      <button
                        type="button"
                        onClick={() => removeVariant(key)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--color-faint)",
                          cursor: "pointer",
                          padding: "4px",
                          marginTop: "4px",
                        }}
                        aria-label={`Remove variant ${key}`}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!readonly && form.type !== "boolean" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<PlusIcon />}
                  onClick={() => {
                    const key = `variant${Object.keys(form.variants).length + 1}`;
                    const defaultVals: Record<FlagType, unknown> = {
                      boolean: true,
                      string: "",
                      number: 0,
                      json: {},
                    };
                    patch("variants", {
                      ...form.variants,
                      [key]: { value: defaultVals[form.type] },
                    });
                  }}
                >
                  Add variant
                </Button>
              )}

              <Select
                label="Default variant"
                value={form.defaultVariant}
                disabled={readonly}
                onChange={(e) => patch("defaultVariant", e.target.value)}
              >
                {variantKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Section>

            {/* Targeting rules */}
            <Section title="Targeting rules">
              {(form.rules ?? []).length === 0 && (
                <p style={{ fontSize: "13px", color: "var(--color-faint)", margin: 0 }}>
                  No rules. Add a rule to target specific users or contexts.
                </p>
              )}
              {(form.rules ?? []).map((rule, ri) => (
                <div
                  key={rule.id}
                  style={{
                    background: "var(--color-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--color-faint)",
                        fontFamily: "var(--font-mono)",
                        minWidth: "22px",
                      }}
                    >
                      {String(ri + 1).padStart(2, "0")}
                    </span>
                    <Input
                      placeholder="Rule name (optional)"
                      value={rule.name ?? ""}
                      disabled={readonly}
                      style={{ flex: 1, fontSize: "12px" }}
                      onChange={(e) => {
                        const rules = [...(form.rules ?? [])];
                        rules[ri] = { ...rules[ri]!, name: e.target.value };
                        patch("rules", rules);
                      }}
                    />
                    {!readonly && (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          disabled={ri === 0}
                          onClick={() => {
                            const rules = [...(form.rules ?? [])];
                            [rules[ri - 1], rules[ri]] = [rules[ri]!, rules[ri - 1]!];
                            patch("rules", rules);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: ri === 0 ? "var(--color-border)" : "var(--color-faint)",
                            cursor: ri === 0 ? "default" : "pointer",
                            padding: "3px",
                          }}
                          aria-label="Move rule up"
                        >
                          <ArrowUpIcon />
                        </button>
                        <button
                          type="button"
                          disabled={ri === (form.rules ?? []).length - 1}
                          onClick={() => {
                            const rules = [...(form.rules ?? [])];
                            [rules[ri], rules[ri + 1]] = [rules[ri + 1]!, rules[ri]!];
                            patch("rules", rules);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color:
                              ri === (form.rules ?? []).length - 1
                                ? "var(--color-border)"
                                : "var(--color-faint)",
                            cursor: ri === (form.rules ?? []).length - 1 ? "default" : "pointer",
                            padding: "3px",
                          }}
                          aria-label="Move rule down"
                        >
                          <ArrowDownIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            patch(
                              "rules",
                              (form.rules ?? []).filter((_, j) => j !== ri),
                            );
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-faint)",
                            cursor: "pointer",
                            padding: "3px",
                          }}
                          aria-label="Remove rule"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Conditions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--color-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      When
                    </span>
                    {rule.conditions.map((cond, ci) => (
                      <ConditionRow
                        key={ci}
                        condition={cond}
                        readonly={readonly}
                        onChange={(c) => {
                          const rules = [...(form.rules ?? [])];
                          const conditions = [...rules[ri]!.conditions];
                          conditions[ci] = c;
                          rules[ri] = { ...rules[ri]!, conditions };
                          patch("rules", rules);
                        }}
                        onRemove={() => {
                          const rules = [...(form.rules ?? [])];
                          rules[ri] = {
                            ...rules[ri]!,
                            conditions: rules[ri]!.conditions.filter((_, j) => j !== ci),
                          };
                          patch("rules", rules);
                        }}
                      />
                    ))}
                    {!readonly && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={<PlusIcon size={12} />}
                        onClick={() => {
                          const rules = [...(form.rules ?? [])];
                          rules[ri] = {
                            ...rules[ri]!,
                            conditions: [
                              ...rules[ri]!.conditions,
                              { attribute: "", operator: "equals", value: "" },
                            ],
                          };
                          patch("rules", rules);
                        }}
                      >
                        Add condition
                      </Button>
                    )}
                  </div>

                  {/* Serve */}
                  <ServeEditor
                    label="Serve"
                    value={rule.serve}
                    variantKeys={variantKeys}
                    readonly={readonly}
                    onChange={(s) => {
                      const rules = [...(form.rules ?? [])];
                      rules[ri] = { ...rules[ri]!, serve: s };
                      patch("rules", rules);
                    }}
                  />
                </div>
              ))}

              {!readonly && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<PlusIcon />}
                  onClick={() => patch("rules", [...(form.rules ?? []), newRule()])}
                >
                  Add rule
                </Button>
              )}
            </Section>

            {/* Overrides */}
            <Section title="Overrides">
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--color-faint)" }}>
                Force a specific variant for a targeting key regardless of rules.
              </p>
              {(form.overrides ?? []).map((ov, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "8px" }}
                >
                  <Input
                    placeholder="targeting key"
                    value={ov.targetingKey}
                    disabled={readonly}
                    onChange={(e) => {
                      const overrides = [...(form.overrides ?? [])];
                      overrides[i] = { ...overrides[i]!, targetingKey: e.target.value };
                      patch("overrides", overrides);
                    }}
                    style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                  />
                  <Select
                    value={ov.variant}
                    disabled={readonly}
                    onChange={(e) => {
                      const overrides = [...(form.overrides ?? [])];
                      overrides[i] = { ...overrides[i]!, variant: e.target.value };
                      patch("overrides", overrides);
                    }}
                  >
                    {variantKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                  {!readonly && (
                    <button
                      type="button"
                      onClick={() =>
                        patch(
                          "overrides",
                          (form.overrides ?? []).filter((_, j) => j !== i),
                        )
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-faint)",
                        cursor: "pointer",
                        padding: "4px",
                        marginTop: "4px",
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
              {!readonly && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<PlusIcon />}
                  onClick={() =>
                    patch("overrides", [
                      ...(form.overrides ?? []),
                      { targetingKey: "", variant: variantKeys[0] ?? "" },
                    ])
                  }
                >
                  Add override
                </Button>
              )}
            </Section>

            {/* Fallthrough */}
            <Section title="Fallthrough">
              <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--color-faint)" }}>
                Applied when no rules match.
              </p>
              <ServeEditor
                value={form.fallthrough}
                variantKeys={variantKeys}
                readonly={readonly}
                onChange={(s) => patch("fallthrough", s)}
              />
            </Section>

            {/* API errors */}
            {apiErrors.length > 0 && (
              <div
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-danger)",
                  }}
                >
                  Validation errors
                </p>
                <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                  {apiErrors.map((e, i) => (
                    <li key={i} style={{ fontSize: "12px", color: "var(--color-danger)" }}>
                      {e.path ? <code>{e.path}</code> : null} {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          {!readonly && (
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                flexShrink: 0,
              }}
            >
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={mutation.isPending}>
                {isCreate ? "Create flag" : "Save changes"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
