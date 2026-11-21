// The standalone SPA: theme applied before first paint, browser history routing
// under the injected base path (`@xtandard/kit/ui` `bootSpa`).
import { bootSpa } from "@xtandard/kit/ui";
import { App } from "./App.tsx";
import { themeStore } from "./theme.ts";
import "./styles.css";

bootSpa({ App, configGlobal: "__FLAGS_CONFIG__", themeKey: themeStore });
