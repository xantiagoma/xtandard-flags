import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "@base-ui-components/react/dialog";
import { getSnapshot, listAudit } from "../api.ts";
import type { AuditEntry } from "../types.ts";
import { Button } from "../components/ui-bits.tsx";
import { cn } from "../lib/utils.ts";

const LazyDiffViewer = React.lazy(() => import("../components/DiffViewer.tsx"));

interface Props {
  projectKey: string;
  environmentKey: string;
}

function formatDate(str: string | undefined): string {
  if (!str) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(str));
  } catch {
    return str;
  }
}

function formatActor(by: AuditEntry["by"]): string {
  if (!by) return "—";
  if (typeof by === "string") return by;
  return by.name ?? by.email ?? by.id ?? "—";
}

function actionBadge(action: string): string {
  if (action.includes("publish")) return "bg-success/10 text-success border-success/20";
  if (action.includes("rollback")) return "bg-warning/10 text-warning border-warning/20";
  if (action.includes("delete")) return "bg-destructive/10 text-destructive border-destructive/20";
  if (action.includes("create")) return "bg-accent/10 text-accent border-accent/20";
  return "bg-secondary/60 text-muted-foreground border-border";
}

/** Predecessor version of `vN` → `v{N-1}`, or null at `v1`. */
function prevVersion(version: string): string | null {
  const n = Number(version.replace(/^v/, ""));
  return Number.isFinite(n) && n > 1 ? `v${n - 1}` : null;
}

const stripStamps = (flags: Record<string, Record<string, unknown>>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(flags ?? {})) {
    const { createdAt: _c, updatedAt: _u, ...rest } = f;
    out[k] = rest;
  }
  return out;
};

type LooseSnapshot = { flags?: Record<string, Record<string, unknown>>; segments?: unknown };
const snapJson = (snap: LooseSnapshot | null | undefined): string =>
  JSON.stringify(
    { flags: stripStamps(snap?.flags ?? {}), segments: snap?.segments ?? {} },
    null,
    2,
  );

/** Diff of an audited snapshot vs its predecessor (or, for a rollback, the version it came from). */
function AuditDiffDialog({
  entry,
  projectKey,
  environmentKey,
  onClose,
}: {
  entry: AuditEntry | null;
  projectKey: string;
  environmentKey: string;
  onClose: () => void;
}) {
  const open = entry !== null;
  const afterV = entry?.version ?? null;
  const beforeV =
    entry?.action === "rollback" && entry.fromVersion
      ? entry.fromVersion
      : afterV
        ? prevVersion(afterV)
        : null;

  const afterQ = useQuery({
    queryKey: ["snapshot", projectKey, environmentKey, afterV],
    queryFn: () => getSnapshot(projectKey, environmentKey, afterV!),
    enabled: open && afterV !== null,
  });
  const beforeQ = useQuery({
    queryKey: ["snapshot", projectKey, environmentKey, beforeV],
    queryFn: () => getSnapshot(projectKey, environmentKey, beforeV!),
    enabled: open && beforeV !== null,
  });

  const theme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light";
  const before = beforeV ? snapJson(beforeQ.data as unknown as LooseSnapshot) : snapJson(null);
  const after = snapJson(afterQ.data as unknown as LooseSnapshot);
  const ready = afterQ.data && (beforeV === null || beforeQ.data);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="border-b border-border px-5 py-4">
            <Dialog.Title className="font-mono text-[15px] font-semibold text-foreground">
              {beforeV ? `${beforeV} → ${afterV}` : `${afterV} (first snapshot)`}
            </Dialog.Title>
            <p className="mt-0.5 text-xs text-muted-foreground capitalize">
              {entry?.action}
              {entry?.message ? ` — ${entry.message}` : ""}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {!ready ? (
              <p className="text-[13px] text-muted-foreground">Loading diff…</p>
            ) : (
              <React.Suspense
                fallback={<p className="text-[13px] text-muted-foreground">Loading diff…</p>}
              >
                <LazyDiffViewer before={before} after={after} theme={theme} />
              </React.Suspense>
            )}
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AuditView({ projectKey, environmentKey }: Props) {
  const query = useQuery({
    queryKey: ["audit", projectKey, environmentKey],
    queryFn: () => listAudit(projectKey, environmentKey),
    staleTime: 15_000,
  });
  const entries = useMemo(() => query.data ?? [], [query.data]);
  const [diffEntry, setDiffEntry] = useState<AuditEntry | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A record of every change to flags in this environment. Click a row with a version to see
          what changed.
        </p>
      </div>

      {query.isLoading && <p className="text-[13px] text-muted-foreground">Loading audit log…</p>}
      {query.isError && <p className="text-[13px] text-destructive">Failed to load audit log</p>}

      {entries.length === 0 && !query.isLoading && (
        <div className="rounded-xl border border-border bg-card px-4 py-16 text-center">
          <p className="text-[13px] text-muted-foreground">No audit entries yet.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Action", "Version", "By", "At", "Message"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry: AuditEntry, i: number) => {
                  const clickable = !!entry.version;
                  return (
                    <tr
                      key={entry.id ?? i}
                      onClick={() => clickable && setDiffEntry(entry)}
                      className={cn(clickable && "cursor-pointer hover:bg-secondary/40")}
                      title={clickable ? "View diff for this version" : undefined}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                            actionBadge(entry.action),
                          )}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {entry.version ?? "—"}
                        {entry.action === "rollback" && entry.fromVersion ? (
                          <span className="text-muted-foreground/50"> ← {entry.fromVersion}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground">
                        {formatActor(entry.by)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] tabular-nums text-muted-foreground">
                        {formatDate(entry.at)}
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-[12px] text-muted-foreground">
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                          {entry.message ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AuditDiffDialog
        entry={diffEntry}
        projectKey={projectKey}
        environmentKey={environmentKey}
        onClose={() => setDiffEntry(null)}
      />
    </div>
  );
}
