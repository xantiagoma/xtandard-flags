/**
 * Minimal host app for the embed theme e2e (e2e/embed-theme.spec.ts): a SPA with
 * class-based dark mode (`class="dark"` on <html>, no data-theme) and its own
 * global text color, embedding the built `dist/react.js` + `dist/react.css`.
 *
 * Bundled by playwright.config.ts's webServer step into e2e/.embed-host/.
 * `?theme=` picks the dashboard's theme prop (default "inherit").
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { FlagsDashboard } from "../../dist/react.js";
import "../../dist/react.css";

const theme = (new URLSearchParams(location.search).get("theme") ?? "inherit") as
  | "auto"
  | "inherit"
  | "light"
  | "dark";

createRoot(document.getElementById("root")!).render(
  <div>
    <header id="host-header">Host app</header>
    {/* The panel API is at the origin root; this page lives under /__embed__/. */}
    <FlagsDashboard apiBaseUrl={location.origin} theme={theme} routing="memory" />
  </div>,
);
