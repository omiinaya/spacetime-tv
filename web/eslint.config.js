import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "dist/",
      "node_modules/",
      "e2e/test-results/",
      "*.config.*",
      "src/vite-env.d.ts",
    ],
  },
  // Global rules
  {
    rules: {
      // Don't flag eslint-disable comments for plugins we don't have
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off",
      // Allow empty catch blocks
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow Function type
      "@typescript-eslint/no-unsafe-function-type": "off",
      // Allow short-circuit/ternary expressions
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
      // Assignment without use is common with destructuring patterns
      "no-useless-assignment": "off",
    },
  },
  // Test files: relax further
  {
    files: ["**/__tests__/**", "**/*.test.*", "**/mocks/**"],
    rules: {
      "no-empty": "off",
      "no-useless-assignment": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
