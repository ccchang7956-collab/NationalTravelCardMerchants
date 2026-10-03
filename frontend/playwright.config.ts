import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.SMOKE_SITE_URL || "http://localhost:13000",
    headless: true,
    permissions: ["geolocation"],
    geolocation: { latitude: 25.0339, longitude: 121.5645 },
    trace: "retain-on-failure",
  },
});
