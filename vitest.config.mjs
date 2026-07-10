import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: srcPath }],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/shiftReportBonuses.ts",
        "src/lib/shiftReportTips.ts",
        "src/lib/payrollCompute.ts",
      ],
    },
  },
});
