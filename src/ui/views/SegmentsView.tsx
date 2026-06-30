import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronRight, Users, ChevronLeft, Trash2, Save } from "lucide-react";
import type { Segment, Condition } from "../types.ts";
import {
  listSegments,
  createSegment,
  updateSegment,
  deleteSegment as deleteSegmentApi,
} from "../api.ts";
import { FlagsApiError } from "../types.ts";
import { useToast } from "../components/Toast.tsx";
import { Button } from "../components/ui-bits.tsx";
import { TextInput, TextArea } from "../components/primitives.tsx";
import { ConditionRow } from "../components/ConditionRow.tsx";

interface Props {
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
  /** Routed selection: a segment key, `"new"`, or undefined for the list. */
  selectedKey?: string;
  onOpen: (key: string) => void;
  onBack: () => void;
}

const newCondition = (): Condition => ({ attribute: "", operator: "equals", value: "" });
const emptySegment = (): Segment => ({ key: "", conditions: [newCondition()] });

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-foreground">{children}</label>;
}

function SegmentEditor({
  segment,
  isCreate,
  segmentKeys,
  projectKey,
  environmentKey,
  readonly,
  onBack,
}: {
  segment: Segment;
  isCreate: boolean;
  segmentKeys: string[];
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
  onBack: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Segment>(segment);
  const [keyError, setKeyError] = useState("");
  const [apiErrors, setApiErrors] = useState<{ path?: string; message: string }[]>([]);

  useEffect(() => {
    setForm(segment);
    setKeyError("");
    setApiErrors([]);
  }, [segment]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["segments", projectKey, environmentKey] });

  const save = useMutation({
    mutationFn: () =>
      isCreate
        ? createSegment(projectKey, environmentKey, form)
        : updateSegment(projectKey, environmentKey, form.key, form),
    onSuccess: () => {
      invalidate();
      toast.add("success", isCreate ? "Segment created" : "Segment saved");
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

  const remove = useMutation({
    mutationFn: () => deleteSegmentApi(projectKey, environmentKey, form.key),
    onSuccess: () => {
      invalidate();
      toast.add("success", "Segment deleted");
      onBack();
    },
    onError: () => toast.add("error", "Failed to delete segment"),
  });

  const handleSave = () => {
    if (isCreate && !form.key.trim()) {
      setKeyError("Key is required");
      return;
    }
    save.mutate();
  };

  // Other segments are pickable for nested `inSegment` conditions (not self).
  const pickableSegments = segmentKeys.filter((k) => k !== form.key);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> All Segments
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {form.key || "New segment"}
        </h1>
        {!readonly && (
          <div className="flex items-center gap-2">
            {!isCreate && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Delete
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="size-4" />}
              onClick={handleSave}
              disabled={save.isPending}
            >
              Save
            </Button>
          </div>
        )}
      </div>

      {apiErrors.length > 0 && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {apiErrors.map((e, i) => (
            <div key={i}>
              {e.path ? `${e.path}: ` : ""}
              {e.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {isCreate && (
            <div>
              <Label>Key *</Label>
              <TextInput
                value={form.key}
                placeholder="eu-beta-users"
                className={keyError ? "border-destructive font-mono" : "font-mono"}
                onChange={(e) => {
                  setForm((f) => ({ ...f, key: e.target.value }));
                  setKeyError("");
                }}
                autoFocus
              />
              {keyError && <p className="mt-1.5 text-xs text-destructive">{keyError}</p>}
            </div>
          )}
          <div>
            <Label>Name</Label>
            <TextInput
              value={form.name ?? ""}
              placeholder="EU beta users"
              disabled={readonly}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className={isCreate ? "sm:col-span-2" : ""}>
            <Label>Description</Label>
            <TextArea
              value={form.description ?? ""}
              placeholder="Who is in this audience?"
              rows={2}
              disabled={readonly}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Conditions (all must match)</Label>
          <div className="space-y-2">
            {form.conditions.map((cond, ci) => (
              <ConditionRow
                key={ci}
                condition={cond}
                isFirst={ci === 0}
                readonly={readonly}
                segmentKeys={pickableSegments}
                onChange={(updated) => {
                  const conditions = [...form.conditions];
                  conditions[ci] = updated;
                  setForm((f) => ({ ...f, conditions }));
                }}
                onRemove={() =>
                  setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== ci) }))
                }
              />
            ))}
            {form.conditions.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No conditions — this segment matches everyone.
              </p>
            )}
          </div>
          {!readonly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus className="size-3.5" />}
              className="mt-2"
              onClick={() =>
                setForm((f) => ({ ...f, conditions: [...f.conditions, newCondition()] }))
              }
            >
              Add condition
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SegmentsView({
  projectKey,
  environmentKey,
  readonly,
  selectedKey,
  onOpen,
  onBack,
}: Props) {
  const query = useQuery({
    queryKey: ["segments", projectKey, environmentKey],
    queryFn: () => listSegments(projectKey, environmentKey),
    staleTime: 10_000,
  });

  const segments = query.data ?? [];
  const segmentKeys = segments.map((s) => s.key);

  const isCreate = selectedKey === "new";
  const existing =
    selectedKey && !isCreate ? (segments.find((s) => s.key === selectedKey) ?? null) : null;

  if (isCreate || existing) {
    return (
      <SegmentEditor
        segment={existing ?? emptySegment()}
        isCreate={isCreate}
        segmentKeys={segmentKeys}
        projectKey={projectKey}
        environmentKey={environmentKey}
        readonly={readonly}
        onBack={onBack}
      />
    );
  }
  if (selectedKey && !isCreate && query.isLoading) {
    return <p className="mt-10 text-center text-[13px] text-muted-foreground">Loading segment…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable audiences referenced by targeting rules. Resolved at publish time.
          </p>
        </div>
        {!readonly && (
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => onOpen("new")}
          >
            New segment
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <p className="mt-8 text-center text-[13px] text-muted-foreground">Loading segments…</p>
      ) : segments.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-secondary/60 text-accent">
            <Users className="size-6" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground mb-1.5">No segments yet</p>
            <p className="text-[13px] text-muted-foreground">
              Define an audience once, then reference it from any flag&apos;s rules.
            </p>
          </div>
          {!readonly && (
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => onOpen("new")}
            >
              Create your first segment
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {segments.map((segment) => (
              <li key={segment.key}>
                <button
                  className="group flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => onOpen(segment.key)}
                >
                  <Users className="size-4 shrink-0 text-muted-foreground/60" />
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-[13px] font-medium text-foreground">
                      {segment.key}
                    </span>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {segment.name ? `${segment.name} · ` : ""}
                      {segment.conditions.length} condition
                      {segment.conditions.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
