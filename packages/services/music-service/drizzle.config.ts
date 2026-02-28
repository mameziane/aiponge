import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/music-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.MUSIC_DATABASE_URL || process.env.DATABASE_URL!,
  },
  tablesFilter: ['mus_*'],
  verbose: true,
  strict: true,
});
