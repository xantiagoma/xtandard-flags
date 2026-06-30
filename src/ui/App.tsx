import React, { useState } from "react";
import { Router, Switch, Route, useLocation, useSearchParams, type BaseLocationHook } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, CloudUpload, Lock } from "lucide-react";
import type { FlagsConfig } from "./types.ts";
import { FlagsApiError } from "./types.ts";
import {
  getConfig,
  publish,
  listProjects,
  listEnvironments,
  createProject,
  createEnvironment,
} from "./api.ts";
import { useToast } from "./components/Toast.tsx";
import { Button } from "./components/ui-bits.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";
import { FlagsView } from "./views/FlagsView.tsx";
import { SegmentsView } from "./views/SegmentsView.tsx";
import { SnapshotsView } from "./views/SnapshotsView.tsx";
import { AuditView } from "./views/AuditView.tsx";
import { cn } from "./lib/utils.ts";
import { Dialog } from "@base-ui-components/react/dialog";
import { TextInput, CreatableCombobox } from "./components/primitives.tsx";

// Nav tabs map to route paths. "flags" is the index ("/").
const NAV_TABS: { path: string; label: string; match: (loc: string) => boolean }[] = [
  { path: "/", label: "Flags", match: (l) => l === "/" || l.startsWith("/flags") },
  { path: "/segments", label: "Segments", match: (l) => l.startsWith("/segments") },
  { path: "/snapshots", label: "Snapshots", match: (l) => l.startsWith("/snapshots") },
  { path: "/audit", label: "Audit", match: (l) => l.startsWith("/audit") },
];

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

/**
 * The dashboard, wrapped in a wouter {@link Router}. `locationHook` + `base` make
 * routing pluggable: the bundled SPA uses browser history (clean paths, served by
 * the handler's SPA catch-all), while the embeddable defaults to hash routing so
 * it never touches the host app's router. Pass a custom hook (e.g. memory) to override.
 */
export function App({
  locationHook,
  base = "",
  logoUrl,
  hideIcon,
}: {
  locationHook?: BaseLocationHook;
  base?: string;
  /** Override the navbar logo image (otherwise taken from server `/config`). */
  logoUrl?: string;
  /** Override hiding the navbar icon (otherwise from server `/config`). */
  hideIcon?: boolean;
}): React.ReactElement {
  return (
    <Router hook={locationHook ?? useHashLocation} base={base}>
      <AppShell logoUrl={logoUrl} hideIcon={hideIcon} />
    </Router>
  );
}

function AppShell({ logoUrl, hideIcon }: { logoUrl?: string; hideIcon?: boolean }) {
  const bootstrap = getBootstrap();
  const toast = useToast();
  const qc = useQueryClient();

  const [location, navigate] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [publishOpen, setPublishOpen] = useState(false);

  // Project/environment live in the URL query so a shared link restores context.
  const projectKey = searchParams.get("project") || (bootstrap.defaultProjectKey ?? "default");
  const environmentKey =
    searchParams.get("env") || (bootstrap.defaultEnvironmentKey ?? "production");

  // Navigate to a path while preserving the project/env query.
  const search = searchParams.toString();
  const go = (path: string) => navigate(search ? `${path}?${search}` : path);

  const setProjectKey = (key: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", key);
        return next;
      },
      { replace: false },
    );
  const setEnvironmentKey = (key: string) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("env", key);
        return next;
      },
      { replace: false },
    );

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 60_000,
    initialData: bootstrap as FlagsConfig | undefined,
  });

  const config = configQuery.data ?? (bootstrap as FlagsConfig);
  const readonly = config?.readonly ?? false;

  // Branding: explicit props win, then server /config, then defaults.
  const brandTitle = config?.title || "@xtandard/flags";
  const brandLogoUrl = logoUrl ?? config?.logoUrl;
  const brandHideIcon = hideIcon ?? config?.hideIcon ?? false;

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

  const createProjectMutation = useMutation({
    mutationFn: (key: string) => createProject(key),
    onSuccess: (meta) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setProjectKey(meta.key);
      toast.add("success", `Project "${meta.key}" created`);
    },
    onError: (err: unknown) =>
      toast.add(
        "error",
        err instanceof FlagsApiError ? err.body.error : "Failed to create project",
      ),
  });

  const createEnvMutation = useMutation({
    mutationFn: (key: string) => createEnvironment(projectKey, key),
    onSuccess: (meta) => {
      qc.invalidateQueries({ queryKey: ["environments", projectKey] });
      setEnvironmentKey(meta.key);
      toast.add("success", `Environment "${meta.key}" created`);
    },
    onError: (err: unknown) =>
      toast.add(
        "error",
        err instanceof FlagsApiError ? err.body.error : "Failed to create environment",
      ),
  });

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
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {/* Logo + wordmark. A configured logoUrl replaces the icon (and the
              wordmark); otherwise the icon shows unless hidden, with the title. */}
          <div className="flex items-center gap-2 shrink-0">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={brandTitle}
                className="h-7 max-w-[320px] object-contain"
              />
            ) : brandHideIcon ? null : (
              <div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
                <Flag className="size-4" strokeWidth={2.5} />
              </div>
            )}
            {!brandLogoUrl && (
              <span className="text-sm font-semibold tracking-tight">{brandTitle}</span>
            )}
          </div>

          <span className="text-border select-none">/</span>

          {/* Project switcher (type to filter or create) */}
          <CreatableCombobox
            value={projectKey}
            options={projectOptions}
            onSelect={setProjectKey}
            onCreate={(key) => createProjectMutation.mutate(key)}
            disabled={readonly}
            aria-label="Project"
            placeholder="Project"
            createLabel={(q) => `Create project "${q}"`}
            className="w-40"
          />

          <span className="text-border select-none">/</span>

          {/* Environment switcher (type to filter or create) */}
          <CreatableCombobox
            value={environmentKey}
            options={envOptions}
            onSelect={setEnvironmentKey}
            onCreate={(key) => createEnvMutation.mutate(key)}
            disabled={readonly}
            aria-label="Environment"
            placeholder="Environment"
            createLabel={(q) => `Create environment "${q}"`}
            className="w-40"
          />

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
          {NAV_TABS.map(({ path, label, match }) => (
            <button
              key={path}
              onClick={() => go(path)}
              className={cn(
                "whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                match(location)
                  ? "relative text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Main content (routed) ────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Switch>
          <Route path="/segments/:segmentKey?">
            {(params) => (
              <SegmentsView
                projectKey={projectKey}
                environmentKey={environmentKey}
                readonly={readonly}
                selectedKey={params.segmentKey}
                onOpen={(key) => go(`/segments/${encodeURIComponent(key)}`)}
                onBack={() => go("/segments")}
              />
            )}
          </Route>
          <Route path="/snapshots/:version?">
            {(params) => (
              <SnapshotsView
                projectKey={projectKey}
                environmentKey={environmentKey}
                readonly={readonly}
                selectedVersion={params.version}
                onOpen={(v) => go(`/snapshots/${encodeURIComponent(v)}`)}
                onBack={() => go("/snapshots")}
              />
            )}
          </Route>
          <Route path="/audit">
            <AuditView projectKey={projectKey} environmentKey={environmentKey} />
          </Route>
          <Route path="/flags/:flagKey?">
            {(params) => (
              <FlagsView
                projectKey={projectKey}
                environmentKey={environmentKey}
                readonly={readonly}
                selectedKey={params.flagKey}
                onOpen={(key) => go(`/flags/${encodeURIComponent(key)}`)}
                onBack={() => go("/")}
              />
            )}
          </Route>
          <Route>
            <FlagsView
              projectKey={projectKey}
              environmentKey={environmentKey}
              readonly={readonly}
              selectedKey={undefined}
              onOpen={(key) => go(`/flags/${encodeURIComponent(key)}`)}
              onBack={() => go("/")}
            />
          </Route>
        </Switch>
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
