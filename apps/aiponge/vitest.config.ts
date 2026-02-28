import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@/': path.resolve(__dirname, 'src') + '/',
      '@/auth/': path.resolve(__dirname, 'src/auth') + '/',
      '@/components/': path.resolve(__dirname, 'src/components') + '/',
      '@/config/': path.resolve(__dirname, 'src/config') + '/',
      '@/constants/': path.resolve(__dirname, 'src/constants') + '/',
      '@/contexts/': path.resolve(__dirname, 'src/contexts') + '/',
      '@/hooks/': path.resolve(__dirname, 'src/hooks') + '/',
      '@/i18n/': path.resolve(__dirname, 'src/i18n') + '/',
      '@/lib/': path.resolve(__dirname, 'src/lib') + '/',
      '@/navigation/': path.resolve(__dirname, 'src/navigation') + '/',
      '@/offline/': path.resolve(__dirname, 'src/offline') + '/',
      '@/safety/': path.resolve(__dirname, 'src/safety') + '/',
      '@/screens/': path.resolve(__dirname, 'src/screens') + '/',
      '@/services/': path.resolve(__dirname, 'src/services') + '/',
      '@/styles/': path.resolve(__dirname, 'src/styles') + '/',
      '@/theme/': path.resolve(__dirname, 'src/theme') + '/',
      '@/types/': path.resolve(__dirname, 'src/types') + '/',
      '@/utils/': path.resolve(__dirname, 'src/utils') + '/',
    },
  },
});
