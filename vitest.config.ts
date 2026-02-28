import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    projects: [
      'packages/services/*/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      reportsDirectory: './coverage',
      clean: true,
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 45,
        lines: 50,
      },
      include: [
        'packages/services/*/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/tests/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/main.ts',
        '**/index.ts',
      ],
    },
  },
});
