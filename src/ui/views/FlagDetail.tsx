import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Plus,
  Trash2,
  GripVertical,
  CornerDownRight,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Percent,
} from "lucide-react";
import type { Flag, FlagOwner, FlagType, Rule, Serve, Variant } from "../types.ts";
import { FlagsApiError } from "../types.ts";
import { createFlag, updateFlag, listSegments } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { TestTargeting } from "../components/TestTargeting.tsx";
import { TagInput } from "../components/TagInput.tsx";
import { ConditionRow } from "../components/ConditionRow.tsx";
import { Button, Badge } from "../components/ui-bits.tsx";
import {
  ToggleSwitch,
  Segmented,
  Dropdown,
  TextInput,
  TextArea,
} from "../components/primitives.tsx";
import { cn } from "../lib/utils.ts";

interface Props {
  flag: Flag | null;
  isCreate: boolean;
  onBack: () => void;
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
}

const TYPE_BADGE: Record<FlagType, string> = {
  boolean: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  string: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  number: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  json: "border-chart-5/30 bg-chart-5/10 text-chart-5",
};

const VARIANT_DOTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

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
  return type === "boolean" ? { variant: "off" } : { variant: "control" };
}

function emptyFlag(): Flag {
  const variants = defaultVariants("boolean");
  return {
    key: "",
    type: "boolean",
    enabled: false,
    description: "",
    defaultVariant: "off",
    variants,
    rules: [],
    overrides: [],
    fallthrough: { variant: "off" },
  };
}

/**
 * Merge a single owner field, returning `undefined` when the result has no name
 * (the schema requires `name`, so a nameless owner is dropped rather than sent).
 */
function patchOwner(
  owner: FlagOwner | undefined,
  field: keyof FlagOwner,
  value: string,
): FlagOwner | undefined {
  const next = { ...owner, [field]: value };
  const name = (next.name ?? "").trim();
  if (!name) return undefined;
  const result: FlagOwner = { name };
  if (next.email?.trim()) result.email = next.email.trim();
  if (next.team?.trim()) result.team = next.team.trim();
  return result;
}

function newRule(): Rule {
  return {
    id: crypto.randomUUID(),
    name: "",
    conditions: [{ attribute: "", operator: "equals", value: "" }],
    serve: { variant: "" },
  };
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[13px] font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VariantValueEditor({
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
  if (type === "boolean")
    return <span className="font-mono text-xs text-muted-foreground">{String(value)}</span>;
  if (type === "json") {
    const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return (
      <TextArea
        value={str}
        disabled={disabled}
        rows={3}
        spellCheck={false}
        className="font-mono text-xs"
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            onChange(e.target.value);
          }
        }}
      />
    );
  }
  return (
    <TextInput
      value={String(value ?? "")}
      disabled={disabled}
      type={type === "number" ? "number" : "text"}
      className="font-mono"
      placeholder={type === "number" ? "0" : "value"}
      onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

function ServeEditor({
  serve,
  variantKeys,
  onChange,
  readonly,
}: {
  serve: Serve;
  variantKeys: string[];
  onChange: (s: Serve) => void;
  readonly: boolean;
}) {
  const isFixed = "variant" in serve;
  const isSplit = "split" in serve;
  const variantOptions = variantKeys.map((k) => ({ value: k, label: k }));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Serve</span>
        {variantKeys.length >= 2 && !readonly && (
          <Segmented
            size="sm"
            value={isSplit ? "split" : "fixed"}
            onValueChange={(mode) => {
              if (mode === "fixed") {
                onChange({ variant: variantKeys[0] ?? "" });
              } else {
                const even = Math.floor(100 / variantKeys.length);
                onChange({
                  split: variantKeys.map((v, i) => ({
                    variant: v,
                    weight: i === 0 ? 100 - even * (variantKeys.length - 1) : even,
                  })),
                });
              }
            }}
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "split", label: "Weighted split" },
            ]}
          />
        )}
      </div>
      {isFixed && (
        <Dropdown
          value={(serve as { variant: string }).variant}
          onValueChange={(v) => onChange({ variant: v })}
          options={variantOptions}
          disabled={readonly}
          className="w-full sm:w-64"
        />
      )}
      {isSplit && (
        <div className="space-y-2">
          {(serve as { split: { variant: string; weight: number }[] }).split.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Dropdown
                value={row.variant}
                onValueChange={(v) => {
                  const split = [
                    ...(serve as { split: { variant: string; weight: number }[] }).split,
                  ];
                  split[i] = { ...split[i]!, variant: v };
                  onChange({ split });
                }}
                options={variantOptions}
                disabled={readonly}
                className="flex-1"
              />
              <div className="relative w-20">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={row.weight}
                  disabled={readonly}
                  onChange={(e) => {
                    const split = [
                      ...(serve as { split: { variant: string; weight: number }[] }).split,
                    ];
                    split[i] = { ...split[i]!, weight: Number(e.target.value) };
                    onChange({ split });
                  }}
                  className="h-8 w-full rounded-md border border-input bg-secondary/40 pl-2 pr-6 text-right text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Percent className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              </div>
              {!readonly && (
                <button
                  type="button"
                  onClick={() => {
                    const split = (
                      serve as { split: { variant: string; weight: number }[] }
                    ).split.filter((_, j) => j !== i);
                    onChange({ split });
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {!readonly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                const split = [
                  ...(serve as { split: { variant: string; weight: number }[] }).split,
                  { variant: variantKeys[0] ?? "", weight: 0 },
                ];
                onChange({ split });
              }}
            >
              Add row
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  variantKeys,
  segmentKeys,
  readonly,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  rule: Rule;
  index: number;
  variantKeys: string[];
  segmentKeys: string[];
  readonly: boolean;
  onChange: (r: Rule) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GripVertical className="size-3.5 cursor-grab text-muted-foreground/50 shrink-0" />
        <span className="text-xs font-medium text-muted-foreground shrink-0">Rule {index + 1}</span>
        <input
          value={rule.name ?? ""}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          disabled={readonly}
          className="flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted-foreground disabled:text-muted-foreground"
          placeholder="Describe this rule…"
        />
        {!readonly && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move rule up"
            >
              <ArrowUp className="size-3" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Move rule down"
            >
              <ArrowDown className="size-3" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Delete rule"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="space-y-2">
          {rule.conditions.map((cond, ci) => (
            <ConditionRow
              key={ci}
              condition={cond}
              isFirst={ci === 0}
              readonly={readonly}
              segmentKeys={segmentKeys}
              onChange={(updated) => {
                const conditions = [...rule.conditions];
                conditions[ci] = updated;
                onChange({ ...rule, conditions });
              }}
              onRemove={() =>
                onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== ci) })
              }
            />
          ))}
        </div>
        {!readonly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() =>
              onChange({
                ...rule,
                conditions: [...rule.conditions, { attribute: "", operator: "equals", value: "" }],
              })
            }
          >
            Add condition
          </Button>
        )}
        <div className="mt-2 flex items-start gap-2 border-t border-border pt-3">
          <CornerDownRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <ServeEditor
              serve={rule.serve}
              variantKeys={variantKeys}
              onChange={(serve) => onChange({ ...rule, serve })}
              readonly={readonly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function FlagDetail({
  flag,
  isCreate,
  onBack,
  projectKey,
  environmentKey,
  readonly,
}: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Flag>(() => flag ?? emptyFlag());
  const [keyError, setKeyError] = useState("");
  const [apiErrors, setApiErrors] = useState<{ path?: string; message: string }[]>([]);

  useEffect(() => {
    setForm(flag ?? emptyFlag());
    setKeyError("");
    setApiErrors([]);
  }, [flag]);

  const segmentsQuery = useQuery({
    queryKey: ["segments", projectKey, environmentKey],
    queryFn: () => listSegments(projectKey, environmentKey),
    staleTime: 30_000,
  });
  const segmentKeys = (segmentsQuery.data ?? []).map((s) => s.key);

  const mutation = useMutation({
    mutationFn: () =>
      isCreate
        ? createFlag(projectKey, environmentKey, form)
        : updateFlag(projectKey, environmentKey, form.key, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
      toast.add("success", isCreate ? "Flag created" : "Flag saved");
      onBack();
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

  const patch = <K extends keyof Flag>(k: K, v: Flag[K]) => setForm((f) => ({ ...f, [k]: v }));
  const variantKeys = Object.keys(form.variants);

  const handleSave = () => {
    if (isCreate) {
      if (!form.key) {
        setKeyError("Key is required");
        return;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(form.key)) {
        setKeyError("Only letters, digits, periods, underscores, and hyphens allowed");
        return;
      }
    }
    setKeyError("");
    mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          All Flags
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {isCreate ? form.key || "New flag" : form.key}
            </h1>
            <Badge className={TYPE_BADGE[form.type]}>{form.type}</Badge>
          </div>
          {form.description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{form.description}</p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-8">
        <SectionCard title="Basics" subtitle="Core settings for this flag.">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {isCreate && (
                <Field label="Key *" hint="Used in code. Must match ^[a-zA-Z0-9._-]+$">
                  <TextInput
                    value={form.key}
                    placeholder="my.feature-flag_v2"
                    className={cn("font-mono", keyError && "border-destructive")}
                    onChange={(e) => {
                      patch("key", e.target.value);
                      setKeyError("");
                    }}
                    autoFocus
                  />
                  {keyError && <p className="mt-1.5 text-xs text-destructive">{keyError}</p>}
                </Field>
              )}
              <Field label="Description" className={isCreate ? "" : "sm:col-span-2"}>
                <TextInput
                  value={form.description ?? ""}
                  placeholder="What does this flag control?"
                  disabled={readonly}
                  onChange={(e) => patch("description", e.target.value)}
                />
              </Field>
              <Field label="Tags" className="sm:col-span-2">
                <TagInput
                  values={form.tags ?? []}
                  onChange={(tags) => patch("tags", tags)}
                  disabled={readonly}
                />
              </Field>
              <Field
                label="Expected lifetime (days)"
                hint="Flags older than this and idle are flagged as stale. Leave blank for permanent flags."
              >
                <TextInput
                  type="number"
                  min={0}
                  value={form.expectedLifetimeDays ?? ""}
                  placeholder="e.g. 90"
                  disabled={readonly}
                  onChange={(e) => {
                    const raw = e.target.value;
                    patch("expectedLifetimeDays", raw === "" ? undefined : Number(raw));
                  }}
                />
              </Field>
              <Field label="Owner" hint="Who maintains this flag.">
                <TextInput
                  value={form.owner?.name ?? ""}
                  placeholder="Name or handle"
                  disabled={readonly}
                  onChange={(e) => patch("owner", patchOwner(form.owner, "name", e.target.value))}
                />
              </Field>
              <Field label="Owner email">
                <TextInput
                  type="email"
                  value={form.owner?.email ?? ""}
                  placeholder="owner@example.com"
                  disabled={readonly}
                  onChange={(e) => patch("owner", patchOwner(form.owner, "email", e.target.value))}
                />
              </Field>
              <Field label="Team">
                <TextInput
                  value={form.owner?.team ?? ""}
                  placeholder="e.g. Growth"
                  disabled={readonly}
                  onChange={(e) => patch("owner", patchOwner(form.owner, "team", e.target.value))}
                />
              </Field>
              {isCreate && (
                <Field label="Type">
                  <Dropdown
                    value={form.type}
                    onValueChange={(t) => {
                      const type = t as FlagType;
                      const variants = defaultVariants(type);
                      const defaultVariant = Object.keys(variants)[0] ?? "";
                      setForm((f) => ({
                        ...f,
                        type,
                        variants,
                        defaultVariant,
                        fallthrough: defaultFallthrough(type),
                      }));
                    }}
                    options={[
                      { value: "boolean", label: "boolean", description: "on / off toggle" },
                      { value: "string", label: "string", description: "text variants" },
                      { value: "number", label: "number", description: "numeric variants" },
                      { value: "json", label: "json", description: "structured variants" },
                    ]}
                    className="w-full"
                  />
                </Field>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  {form.enabled ? "This flag is active." : "This flag is off for everyone."}
                </p>
              </div>
              <ToggleSwitch
                checked={form.enabled}
                onCheckedChange={(v) => patch("enabled", v)}
                disabled={readonly}
                aria-label="Flag enabled"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Variations"
          subtitle={
            form.type === "boolean"
              ? "Boolean flags always serve true or false."
              : "Define the possible values this flag can serve."
          }
        >
          <div className="space-y-3">
            {variantKeys.map((key, i) => {
              const variant = form.variants[key]!;
              return (
                <div key={key} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-sm",
                        VARIANT_DOTS[i % VARIANT_DOTS.length],
                      )}
                    />
                    <span className="font-mono text-[13px] font-medium text-foreground">{key}</span>
                    <input
                      value={variant.name ?? ""}
                      onChange={(e) =>
                        patch("variants", {
                          ...form.variants,
                          [key]: { ...variant, name: e.target.value },
                        })
                      }
                      disabled={readonly}
                      className="flex-1 bg-transparent text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-70"
                      placeholder="Display name (optional)"
                    />
                    {!readonly && form.type !== "boolean" && variantKeys.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...form.variants };
                          delete next[key];
                          patch("variants", next);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove variant ${key}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 pl-[18px]">
                    <VariantValueEditor
                      type={form.type}
                      value={variant.value}
                      disabled={readonly || form.type === "boolean"}
                      onChange={(v) =>
                        patch("variants", { ...form.variants, [key]: { ...variant, value: v } })
                      }
                    />
                  </div>
                </div>
              );
            })}
            {!readonly && form.type !== "boolean" && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  const newKey = `variant${variantKeys.length + 1}`;
                  const defaultVal: Record<FlagType, unknown> = {
                    boolean: true,
                    string: "",
                    number: 0,
                    json: {},
                  };
                  patch("variants", {
                    ...form.variants,
                    [newKey]: { value: defaultVal[form.type] },
                  });
                }}
              >
                Add variation
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Default Variant"
          subtitle="The variant served when no targeting rule matches."
        >
          <div className="rounded-xl border border-border bg-card p-5">
            <Dropdown
              value={form.defaultVariant}
              onValueChange={(v) => patch("defaultVariant", v)}
              options={variantKeys.map((k) => ({ value: k, label: k }))}
              disabled={readonly}
              className="w-full sm:w-64"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Targeting Rules"
          subtitle="Rules are evaluated in order; first match wins."
        >
          <div className="space-y-3">
            {(form.rules ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No targeting rules. Everyone receives the default variant.
              </p>
            )}
            {(form.rules ?? []).map((rule, ri) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={ri}
                variantKeys={variantKeys}
                segmentKeys={segmentKeys}
                readonly={readonly}
                canMoveUp={ri > 0}
                canMoveDown={ri < (form.rules ?? []).length - 1}
                onChange={(updated) => {
                  const rules = [...(form.rules ?? [])];
                  rules[ri] = updated;
                  patch("rules", rules);
                }}
                onRemove={() =>
                  patch(
                    "rules",
                    (form.rules ?? []).filter((_, j) => j !== ri),
                  )
                }
                onMoveUp={() => {
                  const rules = [...(form.rules ?? [])];
                  [rules[ri - 1], rules[ri]] = [rules[ri]!, rules[ri - 1]!];
                  patch("rules", rules);
                }}
                onMoveDown={() => {
                  const rules = [...(form.rules ?? [])];
                  [rules[ri], rules[ri + 1]] = [rules[ri + 1]!, rules[ri]!];
                  patch("rules", rules);
                }}
              />
            ))}
            {!readonly && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => patch("rules", [...(form.rules ?? []), newRule()])}
              >
                Add rule
              </Button>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Overrides"
          subtitle="Force a specific variant for a targeting key, regardless of rules."
        >
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            {(form.overrides ?? []).length === 0 && (
              <p className="text-[13px] text-muted-foreground">No overrides configured.</p>
            )}
            {(form.overrides ?? []).map((ov, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  placeholder="targeting key"
                  value={ov.targetingKey}
                  disabled={readonly}
                  className="flex-1 font-mono"
                  onChange={(e) => {
                    const overrides = [...(form.overrides ?? [])];
                    overrides[i] = { ...overrides[i]!, targetingKey: e.target.value };
                    patch("overrides", overrides);
                  }}
                />
                <Dropdown
                  value={ov.variant}
                  onValueChange={(v) => {
                    const overrides = [...(form.overrides ?? [])];
                    overrides[i] = { ...overrides[i]!, variant: v };
                    patch("overrides", overrides);
                  }}
                  options={variantKeys.map((k) => ({ value: k, label: k }))}
                  disabled={readonly}
                  className="w-40"
                />
                {!readonly && (
                  <button
                    type="button"
                    onClick={() =>
                      patch(
                        "overrides",
                        (form.overrides ?? []).filter((_, j) => j !== i),
                      )
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!readonly && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="size-3.5" />}
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
          </div>
        </SectionCard>

        <SectionCard
          title="Fallthrough"
          subtitle="Applied when no targeting rules match and there are no overrides."
        >
          <div className="rounded-xl border border-border bg-card p-5">
            <ServeEditor
              serve={form.fallthrough}
              variantKeys={variantKeys}
              onChange={(s) => patch("fallthrough", s)}
              readonly={readonly}
            />
          </div>
        </SectionCard>

        {!isCreate && (
          <SectionCard title="Test targeting" subtitle="See how this flag resolves for a context.">
            <TestTargeting
              flagKey={form.key}
              projectKey={projectKey}
              environmentKey={environmentKey}
            />
          </SectionCard>
        )}

        {apiErrors.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="mb-1.5 text-[12px] font-semibold text-destructive">Validation errors</p>
            <ul className="space-y-1 pl-4 list-disc">
              {apiErrors.map((e, i) => (
                <li key={i} className="text-xs text-destructive">
                  {e.path ? <code className="font-mono">{e.path}</code> : null} {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            {isCreate
              ? "Fill in the details and save to create."
              : "Save changes then publish to go live."}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onBack}>
              Cancel
            </Button>
            {!readonly && (
              <Button variant="primary" loading={mutation.isPending} onClick={handleSave}>
                {isCreate ? "Create flag" : "Save changes"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
