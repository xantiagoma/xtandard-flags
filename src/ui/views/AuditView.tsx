import React from "react";
import { useQuery } from "@tanstack/react-query";
import { listAudit } from "../api.ts";
import type { AuditEntry } from "../types.ts";
import { cn } from "../lib/utils.ts";

interface Props {
  projectKey: string;
  environmentKey: string;
}

function formatDate(str: string | undefined): string {
  if (!str) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(str));
  } catch { return str; }
}

function actionBadge(action: string): string {
  if (action.includes("publish")) return "bg-success/10 text-success border-success/20";
  if (action.includes("rollback")) return "bg-warning/10 text-warning border-warning/20";
  if (action.includes("delete")) return "bg-destructive/10 text-destructive border-destructive/20";
  if (action.includes("create")) return "bg-accent/10 text-accent border-accent/20";
  return "bg-secondary/60 text-muted-foreground border-border";
}

export function AuditView({ projectKey, environmentKey }: Props) {
  const query = useQuery({ queryKey: ["audit", projectKey, environmentKey], queryFn: () => listAudit(projectKey, environmentKey), staleTime: 15_000 });
  const entries = query.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">A record of every change to flags in this environment.</p>
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
                  {["Action", "Flag", "Version", "By", "At", "Message"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry: AuditEntry, i: number) => (
                  <tr key={entry.id ?? i}>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium", actionBadge(entry.action))}>{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-accent">{entry.flagKey ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{entry.version ?? "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{entry.by ?? "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(entry.at)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground max-w-[200px]"><span className="block overflow-hidden text-ellipsis whitespace-nowrap">{entry.message ?? "—"}</span></td>
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
