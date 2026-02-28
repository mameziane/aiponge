import { defineConfig } from 'vitest/config';
import path from 'path';

const testsDir = path.resolve(__dirname);

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 60000,
    root: testsDir,
    include: [
      'integration/**/*.test.ts',
      'e2e/**/*.test.ts',
      'unit/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
    ],
    setupFiles: ['./utils/setup.ts'],
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      '@aiponge/platform-core': path.resolve(__dirname, '..', 'packages/platform-core/src/index.ts'),
      '@aiponge/shared-contracts': path.resolve(__dirname, '..', 'packages/shared/contracts/src/index.ts'),
    },
  },
});
