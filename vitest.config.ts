import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Neutralize the RSC import guard in tests.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    // Component tests (.tsx) opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // The *.emulator.test.ts files all hit ONE shared local Firestore
    // emulator instance — running test files in parallel (vitest's default)
    // contends for it and causes intermittent 5s timeouts under load,
    // especially on CI's slower/shared runners (confirmed: the exact same
    // suite is 100% green run serially, flaky run in parallel). Serial
    // execution costs ~14s locally for the whole suite, which is cheap next
    // to the cost of flaky CI. testTimeout gives serialized runs on a slower
    // CI machine some headroom too.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
