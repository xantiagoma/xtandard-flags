import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui-components/react/dialog";
import {
  listSnapshots,
  getSnapshot,
  rollback,
  importDraft,
  schemaUrl,
  type SnapshotDetail,
} from "../api.ts";
import type { Flag, Segment, SnapshotSummary } from "../types.ts";
import { FlagsApiError } from "../types.ts";
import { useToast } from "../components/Toast.tsx";
import { Button } from "../components/ui-bits.tsx";
import { TextInput } from "../components/primitives.tsx";
import { JsonCodeEditor } from "../components/JsonCodeEditor.tsx";

interface Props {
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
  /** Routed selection: the version whose detail dialog is open, or undefined. */
  selectedVersion?: string;
  onOpen: (version: string) => void;
  onBack: () => void;
  /** Called after a successful import, so the host can route to the draft for review. */
  onImported?: () => void;
}

/** Trigger a client-side download of `text` as a file named `filename`. */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Serialize a snapshot for download, with a `$schema` reference editors can validate against. */
function snapshotDownload(detail: SnapshotDetail): string {
  return JSON.stringify({ $schema: schemaUrl(), ...detail }, null, 2);
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
    }).format(new Date(str));
  } catch {
    return str;
  }
}

function SnapshotDetailDialog({
  open,
  onClose,
  projectKey,
  environmentKey,
  version,
  isActive,
  readonly,
  onRollback,
}: {
  open: boolean;
  onClose: () => void;
  projectKey: string;
  environmentKey: string;
  version: string | null;
  isActive: boolean;
  readonly: boolean;
  onRollback: (version: string, msg?: string) => void;
}) {
  const query = useQuery({
    queryKey: ["snapshot", projectKey, environmentKey, version],
    queryFn: () => getSnapshot(projectKey, environmentKey, version!),
    enabled: open && version !== null,
  });
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [rollbackMsg, setRollbackMsg] = useState("");

  if (!open || !version) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setConfirmRollback(false);
          setRollbackMsg("");
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[85vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
            <Dialog.Title className="text-[15px] font-semibold text-foreground font-mono">
              Snapshot {version}
            </Dialog.Title>
            {isActive && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                active
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {query.isLoading && <p className="text-[13px] text-muted-foreground">Loading…</p>}
            {query.isError && (
              <p className="text-[13px] text-destructive">Failed to load snapshot</p>
            )}
            {query.data && (
              <JsonCodeEditor
                value={JSON.stringify(query.data, null, 2)}
                onChange={() => {}}
                readOnly
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 shrink-0">
            {query.data && !confirmRollback && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  downloadText(`snapshot-${version}.json`, snapshotDownload(query.data))
                }
              >
                Download JSON
              </Button>
            )}
            {!isActive && !readonly && !confirmRollback && (
              <Button variant="danger" size="sm" onClick={() => setConfirmRollback(true)}>
                Roll back to this version
              </Button>
            )}
            {confirmRollback && (
              <>
                <TextInput
                  placeholder="Rollback reason (optional)"
                  value={rollbackMsg}
                  onChange={(e) => setRollbackMsg(e.target.value)}
                  className="flex-1 min-w-40"
                />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onRollback(version, rollbackMsg || undefined)}
                >
                  Confirm rollback
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmRollback(false)}>
                  Cancel
                </Button>
              </>
            )}
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SnapshotsView({
  projectKey,
  environmentKey,
  readonly,
  selectedVersion,
  onOpen,
  onBack,
  onImported,
}: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: (doc: { flags: Record<string, Flag>; segments?: Record<string, Segment> }) =>
      importDraft(projectKey, environmentKey, doc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["segments", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["draft", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["draftDiff", projectKey, environmentKey] });
      toast.add("success", "Imported into draft — review the changes, then publish to go live");
      onImported?.();
    },
    onError: (err: unknown) => {
      if (err instanceof FlagsApiError) toast.add("error", err.body.error);
      else toast.add("error", "Import failed — invalid configuration");
    },
  });

  async function handleFile(file: File): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.add("error", "Could not parse file — expected JSON");
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      toast.add("error", "Invalid file — expected a JSON object with a `flags` map");
      return;
    }
    const doc = parsed as { flags?: unknown; segments?: unknown };
    if (typeof doc.flags !== "object" || doc.flags === null) {
      toast.add("error", "Invalid file — missing a `flags` map");
      return;
    }
    importMutation.mutate({
      flags: doc.flags as Record<string, Flag>,
      segments:
        typeof doc.segments === "object" && doc.segments !== null
          ? (doc.segments as Record<string, Segment>)
          : undefined,
    });
  }

  const query = useQuery({
    queryKey: ["snapshots", projectKey, environmentKey],
    queryFn: () => listSnapshots(projectKey, environmentKey),
    staleTime: 15_000,
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ version, message }: { version: string; message?: string }) =>
      rollback(projectKey, environmentKey, version, message),
    onSuccess: (_data, { version }) => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
      toast.add("success", `Rolled back to version ${version}`);
      onBack();
    },
    onError: (err: unknown) => {
      if (err instanceof FlagsApiError) toast.add("error", err.body.error);
      else toast.add("error", "Rollback failed");
    },
  });

  const data = query.data;
  const versions = data?.versions ?? [];
  const active = data?.active ?? null;
  const selectedIsActive = selectedVersion != null && selectedVersion === active;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Snapshots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Published versions of the flag configuration. Roll back to any previous state.
          </p>
        </div>
        {!readonly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={importMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {importMutation.isPending ? "Importing…" : "Import JSON"}
            </Button>
          </>
        )}
      </div>

      {query.isLoading && <p className="text-[13px] text-muted-foreground">Loading snapshots…</p>}
      {query.isError && <p className="text-[13px] text-destructive">Failed to load snapshots</p>}

      {versions.length === 0 && !query.isLoading && (
        <div className="rounded-xl border border-border bg-card px-4 py-16 text-center">
          <p className="text-[13px] text-muted-foreground">
            No snapshots yet. Publish your flags to create the first version.
          </p>
        </div>
      )}

      {versions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {["Version", "Published", "By", "Message", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {versions.map((v: SnapshotSummary) => (
                  <tr
                    key={v.version}
                    className="cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => onOpen(v.version)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-accent">
                          {v.version}
                        </span>
                        {v.version === active && (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                            active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDate(v.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{v.by ?? "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[200px]">
                      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                        {v.message || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {v.version !== active && !readonly && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-warning hover:text-warning"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(v.version);
                          }}
                        >
                          Roll back
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SnapshotDetailDialog
        open={selectedVersion != null}
        onClose={onBack}
        projectKey={projectKey}
        environmentKey={environmentKey}
        version={selectedVersion ?? null}
        isActive={selectedIsActive}
        readonly={readonly}
        onRollback={(version, message) => rollbackMutation.mutate({ version, message })}
      />
    </div>
  );
}
