import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  testMatch: 'nested-jsx-imports.spec.ts',
  reporter: [['line'], ['json', { outputFile: process.env.ISSUE733_REPORT ?? 'issue733-results.json' }]],
  use: {
    ...config.use,
    screenshot: 'off',
    video: 'off',
    trace: 'off'
  }
})
