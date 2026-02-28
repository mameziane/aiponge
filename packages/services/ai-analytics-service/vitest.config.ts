import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 60,
        functions: 80,
        lines: 77,
        statements: 78,
      },
    },
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@aiponge/platform-core': path.resolve(__dirname, '../../platform-core/src'),
      '@aiponge/shared-contracts': path.resolve(__dirname, '../../shared/contracts/src'),
      '@aiponge/test-utils': path.resolve(__dirname, '../../shared/test-utils/src'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@domains': path.resolve(__dirname, 'src/domains'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@presentation': path.resolve(__dirname, 'src/presentation'),
      '@schema': path.resolve(__dirname, 'src/schema'),
    },
  },
});
