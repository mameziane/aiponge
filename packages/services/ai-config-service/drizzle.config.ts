import { defineConfig } from 'drizzle-kit';

const getDatabaseUrl = () => {
  const aiConfigDbUrl = process.env.AI_CONFIG_DATABASE_URL || process.env.DATABASE_URL;
  if (!aiConfigDbUrl) {
    throw new Error(
      'AI_CONFIG_DATABASE_URL (preferred) or DATABASE_URL environment variable is required for ai-config-service.'
    );
  }
  return aiConfigDbUrl;
};

export default defineConfig({
  schema: './src/schema/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['cfg_*'],
  verbose: true,
  strict: true,
});
