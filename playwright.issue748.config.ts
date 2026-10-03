import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  testMatch: 'codeblock-toolbar-layout.spec.ts',
  reporter: [['line'], ['json', { outputFile: process.env.ISSUE748_REPORT ?? 'issue748-results.json' }]],
  use: {
    ...config.use,
    screenshot: 'off',
    video: 'off',
    trace: 'off'
  }
})
