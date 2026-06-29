import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /flags → the standalone panel so the embedded component is same-origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5189, proxy: { "/flags": "http://localhost:3700" } },
});
