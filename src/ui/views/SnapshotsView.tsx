import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSnapshots, getSnapshot, rollback } from "../api.ts";
import type { SnapshotSummary } from "../types.ts";
import { FlagsApiError } from "../types.ts";
import { useToast } from "../components/Toast.tsx";
import { Button } from "../components/Button.tsx";
import { Pill } from "../components/Badge.tsx";
import { Modal } from "../components/Modal.tsx";

interface Props {
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
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

function SnapshotDetailModal({
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
  onRollback: (version: string) => void;
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
    <Modal
      open={open}
      onClose={onClose}
      title={`Snapshot ${version}`}
      size="lg"
      footer={
        <div style={{ display: "flex", gap: "8px", alignItems: "center", width: "100%" }}>
          {!isActive && !readonly && !confirmRollback && (
            <Button variant="danger" size="sm" onClick={() => setConfirmRollback(true)}>
              Roll back to this version
            </Button>
          )}
          {confirmRollback && (
            <>
              <input
                placeholder="Rollback reason (optional)"
                value={rollbackMsg}
                onChange={(e) => setRollbackMsg(e.target.value)}
                style={{
                  flex: 1,
                  background: "var(--color-elevated)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--color-text)",
                  fontSize: "13px",
                  padding: "5px 10px",
                  height: "32px",
                  outline: "none",
                  fontFamily: "var(--font-sans)",
                }}
              />
              <Button variant="danger" size="sm" onClick={() => onRollback(version)}>
                Confirm rollback
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmRollback(false)}>
                Cancel
              </Button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {query.isLoading && <p style={{ color: "var(--color-muted)", fontSize: "13px" }}>Loading…</p>}
      {query.isError && (
        <p style={{ color: "#ef4444", fontSize: "13px" }}>Failed to load snapshot</p>
      )}
      {query.data && (
        <div style={{ overflowX: "auto" }}>
          <pre
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--color-text)",
              lineHeight: 1.6,
              background: "var(--color-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "14px",
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {JSON.stringify(query.data, null, 2)}
          </pre>
        </div>
      )}
    </Modal>
  );
}

export function SnapshotsView({ projectKey, environmentKey, readonly }: Props) {
  const toast = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["snapshots", projectKey, environmentKey],
    queryFn: () => listSnapshots(projectKey, environmentKey),
    staleTime: 15_000,
  });

  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  const rollbackMutation = useMutation({
    mutationFn: (version: string) => rollback(projectKey, environmentKey, version),
    onSuccess: (_data, version) => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
      toast.add("success", `Rolled back to version ${version}`);
      setSelectedVersion(null);
    },
    onError: (err: unknown) => {
      if (err instanceof FlagsApiError) {
        toast.add("error", err.body.error);
      } else {
        toast.add("error", "Rollback failed");
      }
    },
  });

  const data = query.data;
  const versions = data?.versions ?? [];
  const active = data?.active ?? null;

  const selectedIsActive = selectedVersion !== null && selectedVersion === active;

  return (
    <div style={{ padding: "24px", maxWidth: "860px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Snapshots
        </h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>
          Published versions of the flag configuration. Roll back to any previous state.
        </p>
      </div>

      {query.isLoading && (
        <p style={{ color: "var(--color-faint)", fontSize: "13px" }}>Loading snapshots…</p>
      )}
      {query.isError && (
        <p style={{ color: "#ef4444", fontSize: "13px" }}>Failed to load snapshots</p>
      )}

      {versions.length === 0 && !query.isLoading && (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-faint)" }}>
            No snapshots yet. Publish your flags to create the first version.
          </p>
        </div>
      )}

      {versions.length > 0 && (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Version", "Published", "By", "Message", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-faint)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map((v: SnapshotSummary) => (
                <tr
                  key={v.version}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    transition: "background 0.08s",
                  }}
                  onClick={() => setSelectedVersion(v.version)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--color-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "11px 16px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      color: "var(--color-accent-light)",
                      fontWeight: 600,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {v.version}
                      {v.version === active && <Pill variant="success">active</Pill>}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      fontSize: "12px",
                      color: "var(--color-muted)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(v.publishedAt)}
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      fontSize: "12px",
                      color: "var(--color-muted)",
                    }}
                  >
                    {v.by ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "11px 16px",
                      fontSize: "12px",
                      color: "var(--color-faint)",
                      maxWidth: "200px",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {v.message || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px" }} onClick={(e) => e.stopPropagation()}>
                    {v.version !== active && !readonly && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersion(v.version);
                        }}
                        style={{ color: "var(--color-warning)" }}
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
      )}

      <SnapshotDetailModal
        open={selectedVersion !== null}
        onClose={() => setSelectedVersion(null)}
        projectKey={projectKey}
        environmentKey={environmentKey}
        version={selectedVersion}
        isActive={selectedIsActive}
        readonly={readonly}
        onRollback={(v) => rollbackMutation.mutate(v)}
      />
    </div>
  );
}
