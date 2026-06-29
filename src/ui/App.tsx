import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FlagsConfig } from "./types.ts";
import { FlagsApiError } from "./types.ts";
import { getConfig, publish, listProjects, listEnvironments } from "./api.ts";
import { useToast } from "./components/Toast.tsx";
import { Button } from "./components/Button.tsx";
import { Pill } from "./components/Badge.tsx";
import {
  FlagIcon,
  SparkIcon,
  CloudUpIcon,
  HistoryIcon,
  AuditIcon,
  LockIcon,
  ChevronDownIcon,
} from "./components/Icons.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { FlagsView } from "./views/FlagsView.tsx";
import { SnapshotsView } from "./views/SnapshotsView.tsx";
import { AuditView } from "./views/AuditView.tsx";

type View = "flags" | "snapshots" | "audit";

declare global {
  interface Window {
    __FLAGS_CONFIG__?: FlagsConfig;
  }
}

function getBootstrap(): Partial<FlagsConfig> {
  return window.__FLAGS_CONFIG__ ?? {};
}

function PublishDialog({
  open,
  onClose,
  onPublish,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onPublish: (msg?: string) => void;
  loading: boolean;
}) {
  const [message, setMessage] = useState("");

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: "440px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            padding: "18px 20px 16px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Publish flags
          </h2>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)" }}>
            Publishing creates a new versioned snapshot of all flags and activates it. This will
            affect live evaluations immediately.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <label
              htmlFor="publish-msg"
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-muted)",
                letterSpacing: "0.02em",
              }}
            >
              Message (optional)
            </label>
            <input
              id="publish-msg"
              type="text"
              placeholder="Describe what changed…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  onPublish(message || undefined);
                }
                if (e.key === "Escape") onClose();
              }}
              style={{
                background: "var(--color-elevated)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text)",
                fontSize: "13px",
                padding: "6px 10px",
                height: "32px",
                width: "100%",
                outline: "none",
                fontFamily: "var(--font-sans)",
              }}
              autoFocus
            />
          </div>
        </div>
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => onPublish(message || undefined)}
          >
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "7px 10px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: active ? "var(--color-accent-dim)" : "transparent",
        color: active ? "var(--color-accent-light)" : "var(--color-muted)",
        fontSize: "13px",
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 0.1s, color 0.1s",
        fontFamily: "var(--font-sans)",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "var(--color-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          color: active ? "var(--color-accent)" : "var(--color-faint)",
          display: "flex",
          alignItems: "center",
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function ProjectEnvPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--color-faint)",
          padding: "0 4px",
        }}
      >
        {label}
      </span>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            background: "var(--color-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text)",
            fontSize: "12px",
            padding: "5px 28px 5px 8px",
            height: "30px",
            width: "100%",
            appearance: "none",
            cursor: "pointer",
            outline: "none",
            fontFamily: "var(--font-mono)",
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {!options.includes(value) && <option value={value}>{value}</option>}
        </select>
        <span
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-faint)",
            pointerEvents: "none",
          }}
        >
          <ChevronDownIcon size={12} />
        </span>
      </div>
    </div>
  );
}

export function App() {
  const bootstrap = getBootstrap();
  const toast = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<View>("flags");
  const [publishOpen, setPublishOpen] = useState(false);
  const [projectKey, setProjectKey] = useState(bootstrap.defaultProjectKey ?? "default");
  const [environmentKey, setEnvironmentKey] = useState(
    bootstrap.defaultEnvironmentKey ?? "production",
  );

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 60_000,
    initialData: bootstrap as FlagsConfig | undefined,
  });

  const config = configQuery.data ?? (bootstrap as FlagsConfig);
  const readonly = config?.readonly ?? false;

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    staleTime: 60_000,
  });

  const envsQuery = useQuery({
    queryKey: ["environments", projectKey],
    queryFn: () => listEnvironments(projectKey),
    staleTime: 60_000,
  });

  const projectOptions = projectsQuery.data?.map((p) => p.key) ?? [projectKey];
  const envOptions = envsQuery.data?.map((e) => e.key) ?? [environmentKey];

  const publishMutation = useMutation({
    mutationFn: (message?: string) => publish(projectKey, environmentKey, message),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["audit", projectKey, environmentKey] });
      const version = (data as { version?: string })?.version;
      toast.add("success", "Published successfully", version ? `Version ${version}` : undefined);
      setPublishOpen(false);
    },
    onError: (err: unknown) => {
      if (err instanceof FlagsApiError) {
        toast.add("error", err.body.error);
      } else {
        toast.add("error", "Publish failed");
      }
    },
  });

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--color-base)",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: "220px",
          flexShrink: 0,
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            padding: "16px 14px 14px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
            }}
          >
            <div
              style={{
                width: "26px",
                height: "26px",
                background:
                  "linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))",
                borderRadius: "7px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-on-accent)",
                flexShrink: 0,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <SparkIcon size={14} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}
              >
                Xtandard
              </div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 500,
                  color: "var(--color-faint)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Flags
              </div>
            </div>
          </div>
        </div>

        {/* Project / Env pickers */}
        <div
          style={{
            padding: "12px 12px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <ProjectEnvPicker
            label="Project"
            value={projectKey}
            options={projectOptions}
            onChange={setProjectKey}
          />
          <ProjectEnvPicker
            label="Environment"
            value={environmentKey}
            options={envOptions}
            onChange={setEnvironmentKey}
          />
        </div>

        {/* Nav */}
        <nav
          style={{
            padding: "10px 8px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
          aria-label="Main navigation"
        >
          <NavItem
            label="Flags"
            icon={<FlagIcon size={15} />}
            active={view === "flags"}
            onClick={() => setView("flags")}
          />
          <NavItem
            label="Snapshots"
            icon={<HistoryIcon size={15} />}
            active={view === "snapshots"}
            onClick={() => setView("snapshots")}
          />
          <NavItem
            label="Audit log"
            icon={<AuditIcon size={15} />}
            active={view === "audit"}
            onClick={() => setView("audit")}
          />
        </nav>

        {/* Bottom: theme switch + info */}
        <div
          style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              color: "var(--color-faint)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {config?.title ?? "Xtandard Flags"}
          </p>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <header
          style={{
            height: "52px",
            flexShrink: 0,
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--color-muted)",
            }}
          >
            <span
              style={{
                background: "var(--color-info-tint)",
                border: "1px solid var(--color-info-border)",
                color: "var(--color-info)",
                borderRadius: "20px",
                padding: "2px 10px",
                fontSize: "11px",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              {environmentKey}
            </span>
            <span style={{ color: "var(--color-faint)" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>{projectKey}</span>
          </div>

          <div style={{ flex: 1 }} />

          {readonly && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid var(--color-warning-border)",
                color: "var(--color-warning)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.03em",
              }}
            >
              <LockIcon size={12} />
              Read-only
            </div>
          )}

          {!readonly && (
            <Button
              variant="primary"
              size="sm"
              icon={<CloudUpIcon size={14} />}
              onClick={() => setPublishOpen(true)}
            >
              Publish
            </Button>
          )}
        </header>

        {/* View content */}
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {view === "flags" && (
            <FlagsView
              projectKey={projectKey}
              environmentKey={environmentKey}
              readonly={readonly}
            />
          )}
          {view === "snapshots" && (
            <SnapshotsView
              projectKey={projectKey}
              environmentKey={environmentKey}
              readonly={readonly}
            />
          )}
          {view === "audit" && (
            <AuditView projectKey={projectKey} environmentKey={environmentKey} />
          )}
        </main>
      </div>

      {/* Publish dialog */}
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={(msg) => publishMutation.mutate(msg)}
        loading={publishMutation.isPending}
      />
    </div>
  );
}
