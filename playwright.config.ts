import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4180/Hackers_D-egua/",
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    reducedMotion: "reduce",
    launchOptions: { executablePath: executablePath || undefined },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4180 --strictPort",
    url: "http://127.0.0.1:4180/Hackers_D-egua/",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://visual-tests.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_visual_test_only",
    },
  },
});
