import { defineConfig } from "@playwright/test";

const port = Number(process.env.WORSHIP_E2E_PORT ?? 23591);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "scroll.spec.ts",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath:
        process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
        "/repl/tools/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command:
      "pnpm --filter @workspace/worship-flow exec vite --config vite.e2e.config.ts --host 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(port),
      BASE_PATH: "/",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_scroll_e2e_mock",
    },
  },
});