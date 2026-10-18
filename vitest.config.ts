import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Match tsconfig paths: src/react imports the core as "linescape".
  resolve: { alias: [{ find: /^linescape$/, replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }] },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
