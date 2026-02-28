import { defineConfig } from 'drizzle-kit';

const getDatabaseUrl = () => {
  const aiAnalyticsDbUrl = process.env.AI_ANALYTICS_DATABASE_URL || process.env.DATABASE_URL;
  if (!aiAnalyticsDbUrl) {
    throw new Error(
      'AI_ANALYTICS_DATABASE_URL (preferred) or DATABASE_URL environment variable is required for ai-analytics-service.'
    );
  }
  return aiAnalyticsDbUrl;
};

export default defineConfig({
  schema: './src/schema/analytics-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['aia_*'],
  verbose: true,
  strict: true,
});
