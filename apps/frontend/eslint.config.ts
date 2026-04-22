import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintReact from "@eslint-react/eslint-plugin";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/tests/e2e/**",      // Keep e2e tests ignored (Cypress)
      "**/tests/real/**",     // Keep real hardware tests ignored
      "**/*.cy.*",            // Keep Cypress files ignored
      "**/*.min.js",
      "**/*.min.css",
      "**/*.css",  // CSS files handled by stylelint, not ESLint
      "**/*.json",
      "**/*.md"
    ]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Node.js globals for config files (vite.config.js, cypress.config.js)
        ...globals.node
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      ...js.configs.recommended.rules,
    }
  },
  // ESLint React recommended rules (replaces eslint-plugin-react + react-hooks)
  eslintReact.configs["recommended-typescript"],
  // Disable set-state-in-effect: setState in useEffect is standard React for data fetching/reset
  {
    rules: {
      "@eslint-react/set-state-in-effect": "off",
    }
  },
  // Test files configuration
  {
    files: ["**/*.test.{ts,tsx}", "**/tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly"
      }
    }
  },
  ...tseslint.configs.recommended,
  // Override: allow intentionally-unused variables prefixed with _ (TypeScript convention)
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  }
];
