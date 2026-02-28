/**
 * Integration Test Helpers
 * Provides real database connections for testing actual implementations
 * 
 * IMPORTANT: These tests connect to a REAL database.
 * They are gated behind the RUN_INTEGRATION_TESTS environment variable.
 * Never run against production databases.
 */

import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as userSchema from '../../infrastructure/database/schemas/user-schema';
import * as profileSchema from '../../infrastructure/database/schemas/profile-schema';
import * as creatorMemberSchema from '../../infrastructure/database/schemas/creator-member-schema';
import * as librarySchema from '../../infrastructure/database/schemas/library-schema';
import { sql, eq, and } from 'drizzle-orm';

export type TestDatabaseSchema = typeof userSchema & typeof profileSchema & typeof creatorMemberSchema & typeof librarySchema;
export type TestDatabaseConnection = PostgresJsDatabase<TestDatabaseSchema>;

let testSql: ReturnType<typeof postgres> | null = null;
let testDb: TestDatabaseConnection | null = null;

export function shouldRunIntegrationTests(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === 'true';
}

export function getTestDatabase(): TestDatabaseConnection {
  if (!testDb) {
    const connectionString = process.env.USER_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('USER_DATABASE_URL or DATABASE_URL required for integration tests');
    }

    testSql = postgres(connectionString, {
      max: 3,
      idle_timeout: 10,
      connect_timeout: 10,
      ssl: 'require',
    });

    testDb = drizzle(testSql, {
      schema: {
        ...userSchema,
        ...profileSchema,
        ...creatorMemberSchema,
        ...librarySchema,
      },
    });
  }
  return testDb;
}

export async function closeTestDatabase(): Promise<void> {
  if (testSql) {
    await testSql.end();
    testSql = null;
    testDb = null;
  }
}

export function generateTestId(_prefix: string = 'test'): string {
  return crypto.randomUUID();
}

export async function cleanupTestUser(db: TestDatabaseConnection, userId: string): Promise<void> {
  try {
    await db.delete(creatorMemberSchema.creatorMembers).where(
      sql`${creatorMemberSchema.creatorMembers.creatorId} = ${userId} OR ${creatorMemberSchema.creatorMembers.memberId} = ${userId}`
    );
    await db.delete(creatorMemberSchema.invitations).where(
      eq(creatorMemberSchema.invitations.creatorId, userId)
    );
    await db.delete(userSchema.users).where(eq(userSchema.users.id, userId));
  } catch (error) {
    console.warn('Cleanup warning (may be expected):', error instanceof Error ? error.message : String(error));
  }
}

export async function createTestUser(
  db: TestDatabaseConnection,
  overrides: Partial<typeof userSchema.users.$inferInsert> = {}
): Promise<typeof userSchema.users.$inferSelect> {
  const userId = overrides.id || generateTestId('user');
  
  const [user] = await db
    .insert(userSchema.users)
    .values({
      id: userId,
      email: overrides.email || `test_${userId}@test.local`,
      passwordHash: overrides.passwordHash || 'test_hash',
      role: overrides.role || 'user',
      status: overrides.status || 'active',
      profile: overrides.profile || {},
      isGuest: overrides.isGuest ?? false,
      ...overrides,
    })
    .returning();

  return user;
}
