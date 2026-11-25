// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testMatch: ['**/tests/offline.spec.js'],
    timeout: 120000,
    expect: { timeout: 15000 },
    outputDir: 'offline-test-results',
    reporter: [['list']],
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:8080',
        headless: true,
        serviceWorkers: 'allow',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                permissions: ['clipboard-read', 'clipboard-write'],
            },
        },
    ],
});
