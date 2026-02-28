import type { Config } from 'drizzle-kit';

// STRICT SERVICE ISOLATION - In production, use AI_CONTENT_DATABASE_URL for isolation
const getDatabaseUrl = () => {
  const aiContentDbUrl = process.env.AI_CONTENT_DATABASE_URL || process.env.DATABASE_URL;
  if (!aiContentDbUrl) {
    throw new Error(
      'AI_CONTENT_DATABASE_URL (preferred) or DATABASE_URL environment variable is required for ai-content-service.'
    );
  }
  return aiContentDbUrl;
};

export default {
  schema: './src/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['aic_*', 'cfg_tier_configs'],
  verbose: true,
  strict: true,
} satisfies Config;
