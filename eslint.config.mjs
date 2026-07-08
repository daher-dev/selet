import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design reference documents, not app code.
    "docs/**",
    // Gitignored orchestration state: nested git worktrees carry their own
    // built .next/ output and docs that the root-anchored globs above miss.
    ".claude/**",
  ]),
]);

export default eslintConfig;
