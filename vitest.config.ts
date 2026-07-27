import { defineConfig } from "vitest/config"

export default defineConfig({
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
    include: ["**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
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
    clearMocks: true,
    restoreMocks: true
  }
})
