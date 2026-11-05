import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Keep the frontend's PostCSS/Tailwind config (repo root) out of backend tests.
  css: { postcss: {} },
  test: {
    // Component tests share one PostgreSQL test database and truncate it between tests,
    // so test files must not run in parallel.
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/seed.ts', 'src/storage/migrate.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
})
