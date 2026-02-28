import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['contracts/live/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@aiponge/shared-contracts': path.resolve(__dirname, '../../packages/shared/contracts/dist'),
    },
  },
});
