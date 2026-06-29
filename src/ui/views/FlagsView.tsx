import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, ChevronRight, Flag, Archive, ArchiveRestore } from "lucide-react";
import type { Flag as FlagType, FlagType as FlagKind } from "../types.ts";
import { listFlags, updateFlag, archiveFlag, restoreFlag } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { Button, Badge } from "../components/ui-bits.tsx";
import { ToggleSwitch } from "../components/primitives.tsx";
import { cn } from "../lib/utils.ts";
import { FlagDetail } from "./FlagDetail.tsx";
import { CreateFlagModal } from "./CreateFlagModal.tsx";

interface Props {
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
}

const TYPE_BADGE: Record<FlagKind, string> = {
  boolean: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  string: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  number: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  json: "border-chart-5/30 bg-chart-5/10 text-chart-5",
};

function valueSummary(flag: FlagType): string {
  const variantKeys = Object.keys(flag.variants);
  const ruleCount = flag.rules?.length ?? 0;
  const base = flag.defaultVariant || (variantKeys[0] ?? "—");
  if (!flag.enabled) return "Off";
  return ruleCount > 0
    ? `${base} · ${ruleCount} rule${ruleCount > 1 ? "s" : ""}`
    : `Default: ${base}`;
}

function EmptyState({ readonly, onCreateClick }: { readonly: boolean; onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-secondary/60 text-accent">
        <Flag className="size-6" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-foreground mb-1.5">No feature flags yet</p>
        <p className="text-[13px] text-muted-foreground">
          Feature flags let you ship safely and roll out incrementally.
        </p>
      </div>
      {!readonly && (
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={onCreateClick}>
          Create your first flag
        </Button>
      )}
    </div>
  );
}

function defaultVariants(type: FlagKind): Record<string, { value: unknown }> {
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

function defaultFallthrough(type: FlagKind) {
  return type === "boolean" ? { variant: "off" } : { variant: "control" };
}

export function FlagsView({ projectKey, environmentKey, readonly }: Props) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFlagKey, setSelectedFlagKey] = useState<string | "new" | null>(null);
  const [createSeed, setCreateSeed] = useState<{ key: string; type: FlagKind } | null>(null);

  const toast = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["flags", projectKey, environmentKey],
    queryFn: () => listFlags(projectKey, environmentKey),
    staleTime: 10_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ flag, enabled }: { flag: FlagType; enabled: boolean }) =>
      updateFlag(projectKey, environmentKey, flag.key, { ...flag, enabled }),
    onMutate: async ({ flag, enabled }) => {
      await qc.cancelQueries({ queryKey: ["flags", projectKey, environmentKey] });
      const prev = qc.getQueryData<FlagType[]>(["flags", projectKey, environmentKey]);
      qc.setQueryData<FlagType[]>(
        ["flags", projectKey, environmentKey],
        (old) => old?.map((f) => (f.key === flag.key ? { ...f, enabled } : f)) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["flags", projectKey, environmentKey], ctx.prev);
      toast.add("error", "Failed to update flag");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ flag, archive }: { flag: FlagType; archive: boolean }) =>
      archive
        ? archiveFlag(projectKey, environmentKey, flag.key)
        : restoreFlag(projectKey, environmentKey, flag.key),
    onSuccess: (_data, { archive }) => {
      toast.add("success", archive ? "Flag archived" : "Flag restored");
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
    },
    onError: (_err, { archive }) => {
      toast.add("error", archive ? "Failed to archive flag" : "Failed to restore flag");
    },
  });

  const flags = query.data ?? [];
  const activeFlags = flags.filter((f) => !f.archivedAt);
  const archivedFlags = flags.filter((f) => f.archivedAt);
  const visible = showArchived ? archivedFlags : activeFlags;
  const filtered = search
    ? visible.filter((f) => {
        const q = search.toLowerCase();
        return (
          f.key.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q) ||
          (f.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      })
    : visible;

  // Handle create: seed from modal → open FlagDetail in create mode
  const handleCreateSeed = (key: string, type: FlagKind) => {
    setCreateSeed({ key, type });
    setSelectedFlagKey("new");
  };

  // Build seed flag for create mode
  const seedFlag: FlagType | null =
    selectedFlagKey === "new" && createSeed
      ? {
          key: createSeed.key,
          type: createSeed.type,
          enabled: false,
          defaultVariant: createSeed.type === "boolean" ? "off" : "control",
          variants: defaultVariants(createSeed.type),
          fallthrough: defaultFallthrough(createSeed.type),
          rules: [],
          overrides: [],
        }
      : null;

  const selectedFlag =
    selectedFlagKey !== null && selectedFlagKey !== "new"
      ? (flags.find((f) => f.key === selectedFlagKey) ?? null)
      : selectedFlagKey === "new"
        ? seedFlag
        : null;

  // Show full-page detail when a flag is selected or creating
  if (selectedFlagKey !== null) {
    return (
      <FlagDetail
        flag={selectedFlag}
        isCreate={selectedFlagKey === "new"}
        onBack={() => {
          setSelectedFlagKey(null);
          setCreateSeed(null);
        }}
        projectKey={projectKey}
        environmentKey={environmentKey}
        readonly={readonly}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeFlags.length} flag{activeFlags.length !== 1 ? "s" : ""}
            {activeFlags.length > 0 ? " — roll out features safely across every environment." : ""}
          </p>
        </div>
        {!readonly && (
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setCreateOpen(true)}
          >
            New flag
          </Button>
        )}
      </div>

      {/* Search + archived filter */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter flags…"
            className="h-9 w-full rounded-md border border-input bg-secondary/40 pl-9 pr-3 text-[13px] outline-none placeholder:text-muted-foreground hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="inline-flex h-9 items-center rounded-md border border-input bg-secondary/40 p-0.5 text-[13px]">
          <button
            type="button"
            onClick={() => setShowArchived(false)}
            className={cn(
              "h-8 rounded-[5px] px-3 font-medium transition-colors",
              !showArchived
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className={cn(
              "h-8 rounded-[5px] px-3 font-medium transition-colors",
              showArchived
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Archived{archivedFlags.length > 0 ? ` (${archivedFlags.length})` : ""}
          </button>
        </div>
      </div>

      {/* Content */}
      {query.isLoading ? (
        <div className="mt-8 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-spin">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="24"
              strokeDashoffset="12"
              strokeLinecap="round"
            />
          </svg>
          Loading flags…
        </div>
      ) : query.isError ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-[13px] text-destructive">Failed to load flags</p>
          <Button size="sm" variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : !showArchived && filtered.length === 0 && activeFlags.length === 0 ? (
        <EmptyState readonly={readonly} onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              {search
                ? `No flags match "${search}".`
                : showArchived
                  ? "No archived flags."
                  : "No active flags."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((flag) => (
                <li key={flag.key}>
                  <div className="group flex w-full items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors">
                    {/* Status dot */}
                    <button
                      className="flex flex-1 items-center gap-3 text-left min-w-0 cursor-pointer"
                      onClick={() => setSelectedFlagKey(flag.key)}
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          flag.enabled ? "bg-success" : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[13px] font-medium text-foreground">
                            {flag.key}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {valueSummary(flag)}
                          {flag.description && (
                            <span className="ml-1 text-muted-foreground/60">
                              · {flag.description}
                            </span>
                          )}
                        </p>
                      </div>
                    </button>

                    {/* Tags */}
                    {flag.tags && flag.tags.length > 0 && (
                      <div className="hidden items-center gap-1.5 lg:flex">
                        {flag.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-secondary/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Type badge */}
                    <Badge className={TYPE_BADGE[flag.type]}>{flag.type}</Badge>

                    {/* Enabled toggle (active flags only) */}
                    {!flag.archivedAt && (
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <ToggleSwitch
                          checked={flag.enabled}
                          onCheckedChange={(enabled) =>
                            !readonly && toggleMutation.mutate({ flag, enabled })
                          }
                          disabled={readonly}
                          aria-label={`Toggle ${flag.key}`}
                        />
                      </div>
                    )}

                    {/* Archive / restore action */}
                    {!readonly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveMutation.mutate({ flag, archive: !flag.archivedAt });
                        }}
                        disabled={archiveMutation.isPending}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 hover:bg-secondary/60 hover:text-foreground disabled:opacity-50"
                        aria-label={`${flag.archivedAt ? "Restore" : "Archive"} ${flag.key}`}
                        title={flag.archivedAt ? "Restore flag" : "Archive flag"}
                      >
                        {flag.archivedAt ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </button>
                    )}

                    {/* Chevron */}
                    <button
                      onClick={() => setSelectedFlagKey(flag.key)}
                      className="shrink-0"
                      aria-label={`Open ${flag.key}`}
                    >
                      <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Create modal */}
      <CreateFlagModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateSeed}
      />
    </div>
  );
}
