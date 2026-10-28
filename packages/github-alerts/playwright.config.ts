import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:61399', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  webServer: { command: 'npm run demo -- --port 61399 --strictPort', url: 'http://127.0.0.1:61399', reuseExistingServer: false },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  workers: 1
})
