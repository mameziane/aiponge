import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const getDatabaseUrl = () => {
  const userDbUrl = process.env.USER_DATABASE_URL || process.env.DATABASE_URL;
  if (!userDbUrl) {
    throw new Error('USER_DATABASE_URL (preferred) or DATABASE_URL environment variable is required for user-service.');
  }
  return userDbUrl;
};

export default {
  schema: [
    './src/infrastructure/database/schemas/user-schema.ts',
    './src/infrastructure/database/schemas/profile-schema.ts',
    './src/infrastructure/database/schemas/subscription-schema.ts',
    './src/infrastructure/database/schemas/library-schema.ts',
    './src/infrastructure/database/schemas/creator-member-schema.ts',
    './src/infrastructure/database/schemas/share-link-schema.ts',
    './src/infrastructure/database/schemas/audit-schema.ts',
    './src/infrastructure/database/schemas/organization-schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  tablesFilter: ['usr_*', 'lib_*'],
  verbose: true,
  strict: true,
} satisfies Config;
