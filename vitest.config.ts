import { defineConfig } from "vitest/config"
import { assertSourceInventory } from "./scripts/verification/source-inventory.mjs"

const canonicalInventory = assertSourceInventory(process.cwd())

export default defineConfig({
  cacheDir: ".artifacts/vitest",
  test: {
    environment: "node",
    environmentMatchGlobs: [
      [
        "{src,renderer/src}/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
        "jsdom"
      ]
    ],
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: canonicalInventory.testFiles,
    exclude: [
      "**/.artifacts/**",
      "**/.git/**",
      "**/coverage/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/node_modules/**",
      "**/release/**"
    ],
    passWithNoTests: false,
    pool: "forks",
    clearMocks: true,
    restoreMocks: true
  }
})
