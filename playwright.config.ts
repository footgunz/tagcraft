import { defineConfig, devices } from '@playwright/test'

// Smoke tests run against the built single-file app (dist/tagcraft.html, opened
// from disk like a user would), so run `npm run build` first.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
