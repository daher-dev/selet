import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false, // tests share emulator state; run in order
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    // Production build: next dev allows only one instance per project
    // (would clash with the local dev server), and CI should test the
    // real build anyway.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: "localhost:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
      NEXT_PUBLIC_AUTH_EMULATOR_HOST: "localhost:9099",
      GOOGLE_CLOUD_PROJECT: "selet-prod",
      NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "selet-prod.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "selet-prod",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:0:web:test",
    },
  },
});
