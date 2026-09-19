import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Preserve the original server-selected random backgrounds and client-only
  // sessionStorage/modal initialization while retaining the upgraded lint rules elsewhere.
  {
    files: ["src/app/s/**/page.tsx"],
    rules: { "react-hooks/purity": "warn" },
  },
  {
    files: [
      "src/app/s/**/preview/PreviewPopup.tsx",
      "src/app/s/**/review/ReviewEditor.tsx",
      "src/app/s/**/review/SubmitEmailErrorNotice.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    "output/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
