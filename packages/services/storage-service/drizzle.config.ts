import { defineConfig } from 'drizzle-kit';

const getDatabaseUrl = () => {
  const storageDbUrl = process.env.STORAGE_DATABASE_URL || process.env.DATABASE_URL;
  if (!storageDbUrl) {
    throw new Error(
      'STORAGE_DATABASE_URL (preferred) or DATABASE_URL environment variable is required for storage-service.'
    );
  }
  return storageDbUrl;
};

export default defineConfig({
  schema: './src/schema/storage-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['stg_*'],
  verbose: true,
  strict: true,
});
