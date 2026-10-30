import { defineConfig } from 'vitest/config'
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'], poolOptions: { forks: { singleFork: true } }, pool: 'forks' }
})
