import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  // The runner cases share one browser page and depend on each other, so run them in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "off", // traces would record the typed password
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      LLM_PROVIDER: "mock",
      ANTHROPIC_API_KEY: "",
      RATE_LIMIT_PER_HOUR: "1000",
      DB_POOL_MAX: "2", // the local prisma dev database is unstable with many sessions
      AUTH_TRUST_HOST: "true",
      AUTH_URL: baseURL,
      NEXTAUTH_URL: baseURL,
    },
  },
});
