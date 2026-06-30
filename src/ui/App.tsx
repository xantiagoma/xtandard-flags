import React, { useState } from "react";
import { Router, Switch, Route, useLocation, useSearchParams, type BaseLocationHook } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Lock, Undo2 } from "lucide-react";
import type { FlagsConfig } from "./types.ts";
import { FlagsApiError } from "./types.ts";
import {
  getConfig,
  publish,
  draftDiff,
  discardDraft,
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
import { canLeave } from "./lib/nav-guard.ts";
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

const DIFF_TONE: Record<string, string> = {
  added: "text-success",
  removed: "text-destructive",
  changed: "text-warning",
};

const LazyDiffViewer = React.lazy(() => import("./components/DiffViewer.tsx"));

function PublishDialog({
  open,
  onClose,
  onPublish,
  loading,
  diff,
}: {
  open: boolean;
  onClose: () => void;
  onPublish: (msg?: string) => void;
  loading: boolean;
  diff?: import("./api.ts").DraftDiff;
}) {
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"summary" | "split">("summary");
  const entries = diff?.entries ?? [];
  const theme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl outline-none">
          <div className="border-b border-border px-5 py-4">
            <Dialog.Title className="text-[15px] font-semibold text-foreground">
              Publish flags
            </Dialog.Title>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
            <p className="text-[13px] text-muted-foreground">
              Publishing creates a new versioned snapshot of all flags and activates it. This will
              affect live evaluations immediately.
            </p>
            {entries.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {entries.length} change{entries.length !== 1 ? "s" : ""} since last publish
                  </span>
                  <div className="ml-auto flex rounded-md border border-border p-0.5 text-xs">
                    {(["summary", "split"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={cn(
                          "rounded px-2 py-0.5 font-medium capitalize transition-colors",
                          tab === t
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t === "split" ? "Diff" : "Summary"}
                      </button>
                    ))}
                  </div>
                </div>
                {tab === "summary" ? (
                  <ul className="max-h-64 overflow-y-auto rounded-md border border-border bg-background/40 p-2 font-mono text-[11px] leading-relaxed">
                    {entries.map((e, i) => (
                      <li key={i} className={DIFF_TONE[e.type] ?? "text-foreground"}>
                        {e.summary}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <React.Suspense
                    fallback={
                      <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
                        Loading diff…
                      </div>
                    }
                  >
                    <LazyDiffViewer before={diff!.before} after={diff!.after} theme={theme} />
                  </React.Suspense>
                )}
              </div>
            )}
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
}: {
  locationHook?: BaseLocationHook;
  base?: string;
  /** Override the navbar logo image (otherwise taken from server `/config`). */
  logoUrl?: string;
}): React.ReactElement {
  return (
    <Router hook={locationHook ?? useHashLocation} base={base}>
      <AppShell logoUrl={logoUrl} />
    </Router>
  );
}

function AppShell({ logoUrl }: { logoUrl?: string }) {
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

  // Navigate to a path while preserving the project/env query. All in-app
  // navigation funnels through these helpers, so they consult the nav guard —
  // a view with unsaved edits (FlagDetail) can veto the move. wouter has no
  // built-in blocker (see molefrog/wouter#452); guarding the entry points is the
  // workaround. (Browser back/forward still isn't interceptable — known edge.)
  const search = searchParams.toString();
  const go = (path: string) => {
    if (!canLeave()) return;
    navigate(search ? `${path}?${search}` : path);
  };

  const setProjectKey = (key: string) => {
    if (!canLeave()) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("project", key);
        return next;
      },
      { replace: false },
    );
  };
  const setEnvironmentKey = (key: string) => {
    if (!canLeave()) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("env", key);
        return next;
      },
      { replace: false },
    );
  };

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

  // Unpublished-changes diff (draft vs last published). Drives the Publish button's
  // enabled state, the "N changes" indicator, and the pre-publish diff preview.
  const diffQuery = useQuery({
    queryKey: ["draftDiff", projectKey, environmentKey],
    queryFn: () => draftDiff(projectKey, environmentKey),
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });
  const diff = diffQuery.data;
  const hasChanges = diff?.changed ?? false;

  const publishMutation = useMutation({
    mutationFn: (message?: string) => publish(projectKey, environmentKey, message),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["snapshots", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["audit", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["draftDiff", projectKey, environmentKey] });
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

  const [discardOpen, setDiscardOpen] = useState(false);
  const discardMutation = useMutation({
    mutationFn: () => discardDraft(projectKey, environmentKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flags", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["segments", projectKey, environmentKey] });
      qc.invalidateQueries({ queryKey: ["draftDiff", projectKey, environmentKey] });
      toast.add("success", "Unpublished changes discarded");
      setDiscardOpen(false);
    },
    onError: () => toast.add("error", "Failed to discard changes"),
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          {/* Brand: a configured logoUrl shows as the logo; otherwise the title
              wordmark. No default icon. */}
          <div className="flex items-center gap-2 shrink-0">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={brandTitle}
                className="h-7 max-w-[320px] object-contain"
              />
            ) : (
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
            {!readonly && hasChanges && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium text-warning"
                title="The draft differs from the published snapshot"
              >
                <span className="size-2 rounded-full bg-warning" aria-hidden />
                {diff!.entries.length} unpublished
              </span>
            )}
            {!readonly && hasChanges && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Undo2 className="size-3.5" />}
                onClick={() => setDiscardOpen(true)}
              >
                Discard
              </Button>
            )}
            {!readonly && (
              <Button
                variant="primary"
                size="sm"
                icon={<CloudUpload className="size-3.5" />}
                onClick={() => setPublishOpen(true)}
                disabled={!hasChanges}
                title={hasChanges ? "Publish unpublished changes" : "Nothing to publish"}
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
        diff={diff}
      />

      {/* ── Discard-changes confirmation ─────────────────────────────────── */}
      <Dialog.Root open={discardOpen} onOpenChange={(o) => !o && setDiscardOpen(false)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-2xl outline-none">
            <div className="border-b border-border px-5 py-4">
              <Dialog.Title className="text-[15px] font-semibold text-foreground">
                Discard unpublished changes
              </Dialog.Title>
            </div>
            <div className="px-5 py-5">
              <p className="text-[13px] text-muted-foreground">
                This resets the draft to the last published snapshot, throwing away all{" "}
                {diff?.entries.length ?? 0} unpublished change
                {(diff?.entries.length ?? 0) !== 1 ? "s" : ""}. This can't be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={discardMutation.isPending}
                onClick={() => discardMutation.mutate()}
              >
                Discard changes
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
