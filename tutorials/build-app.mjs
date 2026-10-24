// Builds the app into .app/ pointed at a fake Supabase host, so recordings can
// never reach the real project. Re-run after app changes, before recording.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync("npx", ["vite", "build", "--config", "vite.config.mjs", "--outDir", "tutorials/.app", "--emptyOutDir"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: "https://demo.supabase.co",
    VITE_SUPABASE_ANON_KEY: "demo-anon-key",
    VITE_GOOGLE_MAPS_API_KEY: "",
  },
});
process.exit(r.status ?? 1);
