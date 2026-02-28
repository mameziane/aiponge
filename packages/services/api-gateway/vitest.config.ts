import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 40,
        functions: 48,
        lines: 55,
        statements: 54,
      },
    },
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
  resolve: {
    alias: {
      '@aiponge/platform-core': path.resolve(__dirname, '../../platform-core/src'),
      '@aiponge/shared-contracts/api/input-schemas': path.resolve(__dirname, '../../shared/contracts/src/api/input-schemas'),
      '@aiponge/shared-contracts': path.resolve(__dirname, '../../shared/contracts/src'),
      '@aiponge/test-utils': path.resolve(__dirname, '../../shared/test-utils/src'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@clients': path.resolve(__dirname, 'src/clients'),
      '@presentation': path.resolve(__dirname, 'src/presentation'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
});
