# Embed the dashboard as a React component

```tsx
import { FlagsDashboard } from "@xtandard/flags/react";
import "@xtandard/flags/react/styles.css";

<FlagsDashboard apiBaseUrl="/flags" />;

// Pre-select where it opens (URL ?project=/&env= still wins):
<FlagsDashboard apiBaseUrl="/flags" initialProjectKey="billing" initialEnvironmentKey="staging" />;
```

`react` + `react-dom` are peers. The panel API must be reachable at `apiBaseUrl`
(here, a Vite dev proxy forwards `/flags` to a standalone server). Build the
package at the repo root first (`bun run build`).

## Run it

```bash
# from the repo root — boots a seeded panel on :3700 + the vite host app:
bun run examples:react-embed          # → http://localhost:5189

# or manually, in this directory:
bun install
bun run start                          # panel + seed + vite in one command
# (or run the two halves yourself: a panel at :3700 with BASE_PATH=/flags, then `bun run dev`)
```
