import React from "react";
import { createRoot } from "react-dom/client";
import { FlagsDashboard } from "@xtandard/flags/react";
import "@xtandard/flags/react/styles.css";

/** A host app that embeds the flags dashboard on one of its routes. */
function HostApp() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ background: "#111827", color: "#fff", padding: "10px 20px", font: "600 14px system-ui", display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ opacity: 0.6 }}>Acme Internal Tools</span>
        <span style={{ opacity: 0.3 }}>/</span>
        <span>Feature Flags</span>
      </div>
      <FlagsDashboard apiBaseUrl="/flags" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<HostApp />);
