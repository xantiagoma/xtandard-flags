# Embed the dashboard as a React component

```tsx
import { FlagsDashboard } from "@xtandard/flags/react";
import "@xtandard/flags/react/styles.css";

<FlagsDashboard apiBaseUrl="/flags" />;
```

`react` + `react-dom` are peers. The panel API must be reachable at `apiBaseUrl`
(here, a Vite dev proxy forwards `/flags` to a standalone server). Build the
package at the repo root first (`bun run build`).
