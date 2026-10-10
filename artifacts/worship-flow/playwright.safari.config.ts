import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WORSHIP_E2E_SAFARI_PORT ?? 23592);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "scroll.safari.spec.ts",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["iPhone 13"],
    browserName: "webkit",
    baseURL,
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
