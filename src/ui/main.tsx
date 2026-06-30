import React from "react";
import { createRoot } from "react-dom/client";
import { useBrowserLocation } from "wouter/use-browser-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { initTheme } from "./theme.ts";
import type { FlagsConfig } from "./types.ts";
import "./styles.css";

// Apply the persisted theme before first paint.
initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

// The bundled SPA owns its URL and the panel handler serves a SPA catch-all under
// the basePath, so use real browser-history routing for clean, deep-linkable paths.
const basePath = (
  (window as { __FLAGS_CONFIG__?: FlagsConfig }).__FLAGS_CONFIG__?.basePath ?? ""
).replace(/\/$/, "");

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App locationHook={useBrowserLocation} base={basePath} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
