import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      [
        "renderer/src/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
        "jsdom"
      ]
    ],
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: [
      "electron/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "renderer/src/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "tests/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"
    ],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true
  }
})
