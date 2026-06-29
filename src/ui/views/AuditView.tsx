import React from "react";
import { useQuery } from "@tanstack/react-query";
import { listAudit } from "../api.ts";
import type { AuditEntry } from "../types.ts";
import { Pill } from "../components/Badge.tsx";

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

function actionVariant(action: string): "accent" | "success" | "warning" | "danger" | "default" {
  if (action.includes("publish")) return "success";
  if (action.includes("rollback")) return "warning";
  if (action.includes("delete")) return "danger";
  if (action.includes("create")) return "accent";
  return "default";
}

export function AuditView({ projectKey, environmentKey }: Props) {
  const query = useQuery({
    queryKey: ["audit", projectKey, environmentKey],
    queryFn: () => listAudit(projectKey, environmentKey),
    staleTime: 15_000,
  });

  const entries = query.data ?? [];

  return (
    <div style={{ padding: "24px", maxWidth: "960px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2
          style={{
            margin: "0 0 4px",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Audit log
        </h2>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>
          A record of every change to flags in this environment.
        </p>
      </div>

      {query.isLoading && (
        <p style={{ color: "var(--color-faint)", fontSize: "13px" }}>Loading audit log…</p>
      )}
      {query.isError && (
        <p style={{ color: "#ef4444", fontSize: "13px" }}>Failed to load audit log</p>
      )}

      {entries.length === 0 && !query.isLoading && (
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
            No audit entries yet.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Action", "Flag", "Version", "By", "At", "Message"].map((h) => (
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
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: AuditEntry, i: number) => (
                  <tr
                    key={entry.id ?? i}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <Pill variant={actionVariant(entry.action)}>{entry.action}</Pill>
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        color: "var(--color-accent-light)",
                      }}
                    >
                      {entry.flagKey ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        color: "var(--color-muted)",
                      }}
                    >
                      {entry.version ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        fontSize: "12px",
                        color: "var(--color-muted)",
                      }}
                    >
                      {entry.by ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        fontSize: "12px",
                        color: "var(--color-muted)",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatDate(entry.at)}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        fontSize: "12px",
                        color: "var(--color-faint)",
                        maxWidth: "200px",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.message ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
