import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "node_modules/**", "artifacts/**", "assets/**", "docs/**", "tools/art/gallery.template.html"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  // Node scripts that also send code into the browser page (page.evaluate).
  { files: ["**/*.mjs"], languageOptions: { globals: { process: "readonly", console: "readonly", window: "readonly", document: "readonly" } } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
