import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    channel: existsSync('/Applications/Google Chrome.app')
      ? 'chrome'
      : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node --env-file=.env.test --import tsx src/index.ts',
      cwd: resolve(import.meta.dirname, '../server'),
      url: 'http://127.0.0.1:3002/api/health',
      env: {
        PORT: '3002',
        NODE_ENV: 'test',
        FRONTEND_ORIGINS: 'http://127.0.0.1:5180',
      },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
      url: 'http://127.0.0.1:5180',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3002' },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
})
