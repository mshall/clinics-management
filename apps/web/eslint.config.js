import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// eslint-plugin-react-hooks v7 adds React Compiler diagnostics (set-state-in-effect, refs, purity, ...).
// They are kept visible as warnings while the app is migrated (see Docs/UPGRADE_NOTES.md);
// rules-of-hooks stays a hard error.
const reactHooksRules = Object.fromEntries(
  Object.entries(reactHooks.configs.flat.recommended.rules).map(([rule, level]) => [
    rule,
    rule === "react-hooks/rules-of-hooks" ? level : "warn",
  ]),
);

export default tseslint.config(
  { ignores: ["dist", "src/lib/openapi-types.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooksRules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  }
);
