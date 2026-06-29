import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, CloudUpload, Lock } from "lucide-react";
import type { FlagsConfig } from "./types.ts";
import { FlagsApiError } from "./types.ts";
import { getConfig, publish, listProjects, listEnvironments } from "./api.ts";
import { useToast } from "./components/Toast.tsx";
import { Button } from "./components/ui-bits.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { FlagsView } from "./views/FlagsView.tsx";
import { SnapshotsView } from "./views/SnapshotsView.tsx";
import { AuditView } from "./views/AuditView.tsx";
import { cn } from "./lib/utils.ts";
import { Dialog } from "@base-ui-components/react/dialog";
import { TextInput } from "./components/primitives.tsx";

type View = "flags" | "snapshots" | "audit";

declare global {
  interface Window {
    __FLAGS_CONFIG__?: FlagsConfig;
  }
}

function getBootstrap(): Partial<FlagsConfig> {
  return window.__FLAGS_CONFIG__ ?? {};
}

const NAV_TABS: { id: View; label: string }[] = [
  { id: "flags", label: "Flags" },
  { id: "snapshots", label: "Snapshots" },
  { id: "audit", label: "Audit" },
];

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

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="border-b border-border px-5 py-4">
            <Dialog.Title className="text-[15px] font-semibold text-foreground">
              Publish flags
            </Dialog.Title>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-[13px] text-muted-foreground">
              Publishing creates a new versioned snapshot of all flags and activates it. This will
              affect live evaluations immediately.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="publish-msg" className="text-xs font-medium text-muted-foreground">
                Message (optional)
              </label>
              <TextInput
                id="publish-msg"
                placeholder="Describe what changed…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) onPublish(message || undefined);
                  if (e.key === "Escape") onClose();
                }}
                autoFocus
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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

  const selectClass =
    "h-8 rounded-md border border-border bg-secondary/40 px-2.5 text-[13px] text-foreground outline-none hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring cursor-pointer appearance-none pr-7";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <Flag className="size-4" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">Xtandard Flags</span>
          </div>

          <span className="text-border select-none">/</span>

          {/* Project select */}
          <div className="relative">
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className={selectClass}
              aria-label="Project"
            >
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {!projectOptions.includes(projectKey) && (
                <option value={projectKey}>{projectKey}</option>
              )}
            </select>
          </div>

          <span className="text-border select-none">/</span>

          {/* Environment select */}
          <div className="relative">
            <select
              value={environmentKey}
              onChange={(e) => setEnvironmentKey(e.target.value)}
              className={selectClass}
              aria-label="Environment"
            >
              {envOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              {!envOptions.includes(environmentKey) && (
                <option value={environmentKey}>{environmentKey}</option>
              )}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {readonly && (
              <span className="flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                <Lock className="size-3" />
                Read-only
              </span>
            )}
            {!readonly && (
              <Button
                variant="primary"
                size="sm"
                icon={<CloudUpload className="size-3.5" />}
                onClick={() => setPublishOpen(true)}
              >
                Publish
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Nav tabs */}
        <nav
          className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 sm:px-4"
          aria-label="Main navigation"
        >
          {NAV_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                view === id
                  ? "relative text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {view === "flags" && (
          <FlagsView projectKey={projectKey} environmentKey={environmentKey} readonly={readonly} />
        )}
        {view === "snapshots" && (
          <SnapshotsView
            projectKey={projectKey}
            environmentKey={environmentKey}
            readonly={readonly}
          />
        )}
        {view === "audit" && <AuditView projectKey={projectKey} environmentKey={environmentKey} />}
      </main>

      {/* ── Publish dialog ───────────────────────────────────────────────── */}
      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={(msg) => publishMutation.mutate(msg)}
        loading={publishMutation.isPending}
      />
    </div>
  );
}
