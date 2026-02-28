/**
 * Integration tests for AuthRepository
 * Tests actual database interactions for user authentication operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AuthRepository } from '../../infrastructure/repositories/AuthRepository';
import { getTestDatabase, closeTestDatabase, shouldRunIntegrationTests, TestDatabaseConnection } from './test-helpers';
import { users } from '../../infrastructure/database/schemas/user-schema';
import { eq } from 'drizzle-orm';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('AuthRepository Integration', () => {
  let db: TestDatabaseConnection;
  let repo: AuthRepository;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    db = await getTestDatabase();
    repo = new AuthRepository(db);
  });

  afterAll(async () => {
    for (const userId of testUserIds) {
      try {
        await db.delete(users).where(eq(users.id, userId));
      } catch {
        // Ignore cleanup errors
      }
    }
    await closeTestDatabase();
  });

  beforeEach(() => {
    testUserIds = [];
  });

  function createNewUserData(
    overrides: Partial<{
      id: string;
      email: string;
      passwordHash: string;
      role: string;
      status: string;
      profile: object;
      phoneE164: string;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
    }> = {}
  ) {
    return {
      id: overrides.id || crypto.randomUUID(),
      email: overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: overrides.passwordHash || 'hashed_password_123',
      role: overrides.role || 'user',
      status: overrides.status || 'active',
      profile: overrides.profile || {},
      phoneE164: overrides.phoneE164,
      failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
      lockedUntil: overrides.lockedUntil ?? null,
    };
  }

  describe('createUser', () => {
    it('should create a new user with valid data', async () => {
      const userData = createNewUserData();

      const user = await repo.createUser(userData);
      testUserIds.push(user.id);

      expect(user).toBeDefined();
      expect(user.id).toBe(userData.id);
      expect(user.email).toBe(userData.email);
      expect(user.passwordHash).toBe(userData.passwordHash);
      expect(user.role).toBe('user');
      expect(user.status).toBe('active');
      expect(user.createdAt).toBeDefined();
    });

    it('should throw error for duplicate email', async () => {
      const email = `duplicate-${Date.now()}@example.com`;
      const userData1 = createNewUserData({ email });
      const userData2 = createNewUserData({ email });

      const user1 = await repo.createUser(userData1);
      testUserIds.push(user1.id);

      await expect(repo.createUser(userData2)).rejects.toThrow();
    });
  });

  describe('findUserById', () => {
    it('should find existing user by ID', async () => {
      const userData = createNewUserData();

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const found = await repo.findUserById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.email).toBe(userData.email);
    });

    it('should return null for non-existent user', async () => {
      const nonExistentId = crypto.randomUUID();
      const found = await repo.findUserById(nonExistentId);

      expect(found).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email', async () => {
      const email = `find-by-email-${Date.now()}@example.com`;
      const userData = createNewUserData({ email });

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const found = await repo.findUserByEmail(email);

      expect(found).toBeDefined();
      expect(found!.email).toBe(email);
    });

    it('should return null for non-existent email', async () => {
      const found = await repo.findUserByEmail(`nonexistent-${Date.now()}@example.com`);

      expect(found).toBeNull();
    });
  });

  describe('findUserByPhone', () => {
    it('should find user by phone number', async () => {
      const phone = `+1555${Date.now().toString().slice(-7)}`;
      const userData = createNewUserData({ phoneE164: phone });

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const found = await repo.findUserByPhone(phone);

      expect(found).toBeDefined();
      expect(found!.phoneE164).toBe(phone);
    });

    it('should return null for non-existent phone', async () => {
      const found = await repo.findUserByPhone('+15550000000');

      expect(found).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      const userData = createNewUserData();

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const updated = await repo.updateUser(created.id, {
        passwordHash: 'new_hash',
      });

      expect(updated.passwordHash).toBe('new_hash');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('should throw error for non-existent user', async () => {
      const nonExistentId = crypto.randomUUID();

      await expect(repo.updateUser(nonExistentId, { passwordHash: 'new_hash' })).rejects.toThrow('User not found');
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const userData = createNewUserData();

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      await repo.updateLastLogin(created.id);

      const afterUpdate = await repo.findUserById(created.id);

      expect(afterUpdate!.lastLoginAt).toBeDefined();
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      const userData = createNewUserData();

      const created = await repo.createUser(userData);

      await repo.deleteUser(created.id);

      const found = await repo.findUserById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('incrementFailedLoginAttempts', () => {
    it('should increment failed login attempts', async () => {
      const userData = createNewUserData();

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const result = await repo.incrementFailedLoginAttempts(created.id);

      expect(result.failedAttempts).toBe(1);
      expect(result.lockedUntil).toBeNull();
    });

    it('should lock account after 5 failed attempts', async () => {
      const userData = createNewUserData({ failedLoginAttempts: 4 });

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      const result = await repo.incrementFailedLoginAttempts(created.id);

      expect(result.failedAttempts).toBe(5);
      expect(result.lockedUntil).toBeDefined();
      expect(result.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('resetFailedLoginAttempts', () => {
    it('should reset failed login attempts to zero', async () => {
      const userData = createNewUserData({
        failedLoginAttempts: 3,
        lockedUntil: new Date(Date.now() + 300000),
      });

      const created = await repo.createUser(userData);
      testUserIds.push(created.id);

      await repo.resetFailedLoginAttempts(created.id);

      const after = await repo.findUserById(created.id);
      expect(after!.failedLoginAttempts).toBe(0);
      expect(after!.lockedUntil).toBeNull();
    });
  });
});
