import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// NOTE: scripts pass `--config vite.config.mjs` explicitly because Vite's
// config auto-discovery fails on OneDrive paths that contain spaces / Hebrew.
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: "@", replacement: srcPath }],
  },
  server: {
    port: 5173,
    host: true,
  },
});
