import { defineConfig } from 'drizzle-kit';

// STRICT SERVICE ISOLATION - No shared DATABASE_URL allowed
const getDatabaseUrl = () => {
  const systemDbUrl = process.env.SYSTEM_DATABASE_URL;
  if (!systemDbUrl) {
    throw new Error(
      'SYSTEM_DATABASE_URL environment variable is required for system-service. No shared DATABASE_URL fallback allowed for microservices isolation.'
    );
  }
  return systemDbUrl;
};

export default defineConfig({
  schema: './src/schema/system-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['sys_*'],
  verbose: true,
  strict: true,
});
