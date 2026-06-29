import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Flag, FlagType } from "../types.ts";
import { listFlags, updateFlag } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { TypeBadge, StatusBadge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { SearchIcon, PlusIcon, FlagIcon } from "../components/Icons.tsx";
import { FlagEditor } from "./FlagEditor.tsx";
import { CreateFlagModal } from "./CreateFlagModal.tsx";

interface Props {
  projectKey: string;
  environmentKey: string;
  readonly: boolean;
}

function EmptyState({ readonly, onCreateClick }: { readonly: boolean; onCreateClick: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          background: "var(--color-elevated)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-accent)",
        }}
      >
        <FlagIcon size={24} />
      </div>
      <div>
        <p
          style={{
            margin: "0 0 6px",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          No feature flags yet
        </p>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>
          Feature flags let you ship safely and roll out incrementally.
        </p>
      </div>
      {!readonly && (
        <Button variant="primary" icon={<PlusIcon />} onClick={onCreateClick}>
          Create your first flag
        </Button>
      )}
    </div>
  );
}

function RuleCount({ count }: { count: number }) {
  if (count === 0) return <span style={{ color: "var(--color-faint)", fontSize: "12px" }}>—</span>;
  return (
    <span
      style={{
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "20px",
        padding: "1px 8px",
        fontSize: "11px",
        color: "var(--color-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {count} rule{count !== 1 ? "s" : ""}
    </span>
  );
}

export function FlagsView({ projectKey, environmentKey, readonly }: Props) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<Flag | null | "new">(null);
  const [createSeed, setCreateSeed] = useState<{ key: string; type: FlagType } | null>(null);

  const toast = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["flags", projectKey, environmentKey],
    queryFn: () => listFlags(projectKey, environmentKey),
    staleTime: 10_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ flag, enabled }: { flag: Flag; enabled: boolean }) =>
      updateFlag(projectKey, environmentKey, flag.key, { ...flag, enabled }),
    onMutate: async ({ flag, enabled }) => {
      await qc.cancelQueries({ queryKey: ["flags", projectKey, environmentKey] });
      const prev = qc.getQueryData<Flag[]>(["flags", projectKey, environmentKey]);
      qc.setQueryData<Flag[]>(
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

  const flags = query.data ?? [];
  const filtered = search
    ? flags.filter(
        (f) =>
          f.key.toLowerCase().includes(search.toLowerCase()) ||
          (f.description ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : flags;

  const handleCreateSeed = (key: string, type: FlagType) => {
    setCreateSeed({ key, type });
    setEditingFlag("new");
  };

  const seedFlag: Flag | null =
    editingFlag === "new" && createSeed
      ? {
          key: createSeed.key,
          type: createSeed.type,
          enabled: false,
          defaultVariant: createSeed.type === "boolean" ? "off" : "control",
          variants:
            createSeed.type === "boolean"
              ? { on: { value: true }, off: { value: false } }
              : createSeed.type === "string"
                ? { control: { value: "control" }, treatment: { value: "treatment" } }
                : createSeed.type === "number"
                  ? { zero: { value: 0 }, one: { value: 1 } }
                  : { control: { value: {} }, treatment: { value: {} } },
          fallthrough: { variant: createSeed.type === "boolean" ? "off" : "control" },
        }
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: "360px" }}>
          <span
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-faint)",
              pointerEvents: "none",
            }}
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search flags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "var(--color-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text)",
              fontSize: "13px",
              padding: "6px 10px 6px 32px",
              height: "32px",
              width: "100%",
              outline: "none",
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: "12px",
            color: "var(--color-faint)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {flags.length} flag{flags.length !== 1 ? "s" : ""}
        </span>
        {!readonly && (
          <Button
            variant="primary"
            size="sm"
            icon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
          >
            New flag
          </Button>
        )}
      </div>

      {/* Loading / Error / Content */}
      {query.isLoading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-faint)",
            fontSize: "13px",
            gap: "8px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ animation: "spin 0.8s linear infinite" }}
          >
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
            <style>{`@keyframes spin { to { transform: rotate(360deg); transform-origin: 50% 50%; } }`}</style>
          </svg>
          Loading flags…
        </div>
      ) : query.isError ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <p style={{ fontSize: "13px", color: "#ef4444" }}>Failed to load flags</p>
          <Button size="sm" variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 && flags.length === 0 ? (
        <EmptyState readonly={readonly} onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p
              style={{
                padding: "40px 24px",
                fontSize: "13px",
                color: "var(--color-faint)",
                textAlign: "center",
              }}
            >
              No flags match "{search}"
            </p>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {["Key", "Type", "Enabled", "Default variant", "Rules"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-faint)",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        background: "var(--color-base)",
                        position: "sticky",
                        top: 0,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((flag) => (
                  <tr
                    key={flag.key}
                    onClick={() => setEditingFlag(flag)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-border)",
                      transition: "background 0.08s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--color-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "11px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: "13px",
                        color: "var(--color-text)",
                        fontWeight: 500,
                        maxWidth: "280px",
                      }}
                    >
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {flag.key}
                      </div>
                      {flag.description && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--color-faint)",
                            fontFamily: "var(--font-sans)",
                            marginTop: "2px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {flag.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <TypeBadge type={flag.type} />
                    </td>
                    <td style={{ padding: "11px 14px" }} onClick={(e) => e.stopPropagation()}>
                      <StatusBadge
                        enabled={flag.enabled}
                        readonly={readonly}
                        onChange={(v) => toggleMutation.mutate({ flag, enabled: v })}
                      />
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          color: "var(--color-accent-light)",
                        }}
                      >
                        {flag.defaultVariant}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <RuleCount count={flag.rules?.length ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create modal */}
      <CreateFlagModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateSeed}
      />

      {/* Flag editor */}
      <FlagEditor
        open={editingFlag !== null}
        flag={editingFlag === "new" ? null : editingFlag}
        seed={seedFlag}
        onClose={() => {
          setEditingFlag(null);
          setCreateSeed(null);
        }}
        projectKey={projectKey}
        environmentKey={environmentKey}
        readonly={readonly}
      />
    </div>
  );
}
