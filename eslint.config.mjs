import js from "@eslint/js"
import css from "@eslint/css"
import json from "@eslint/json"
import markdown from "@eslint/markdown"
import tseslintPlugin from "@typescript-eslint/eslint-plugin"
import tseslintParser from "@typescript-eslint/parser"
import globals from "globals"
import { tailwind3 } from "tailwind-csstree"

const sourceFiles = ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"]
const generatedArtifacts = [
  ".artifacts/**",
  "coverage/**",
  "dist/**",
  "dist-electron/**",
  "node_modules/**",
  "package-lock.json",
  "release/**"
]

export default [
  { ignores: generatedArtifacts },
  {
    ...js.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin
    },
    rules: {
      ...tseslintPlugin.configs.recommended.rules,
      "no-undef": "off"
    }
  },
  {
    files: [
      "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "tests/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"
    ],
    languageOptions: {
      globals: globals.vitest
    }
  },
  {
    ...json.configs.recommended,
    files: ["**/*.json"],
    language: "json/json"
  },
  ...markdown.configs.recommended,
  {
    ...css.configs.recommended,
    files: ["**/*.css"],
    language: "css/css",
    languageOptions: {
      customSyntax: tailwind3
    },
    rules: {
      ...css.configs.recommended.rules,
      "css/use-baseline": ["error", { available: 2026 }]
    }
  }
]
