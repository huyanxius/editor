import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  testMatch: 'source-insert-markdown.spec.ts',
  reporter: [['line'], ['json', { outputFile: process.env.ISSUE636_REPORT ?? 'issue636-results.json' }]],
  use: {
    ...config.use,
    screenshot: 'off',
    video: 'off',
    trace: 'off'
  }
})
