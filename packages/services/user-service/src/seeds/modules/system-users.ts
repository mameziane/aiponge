import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';

const SYSTEM_USERS = [
  {
    id: 'a027c10e-0c6b-4bfe-bf5c-1c92a1f5d55c',
    email: 'library@aiponge.com',
    role: 'librarian',
    displayName: 'aiponge originals',
    isSystemAccount: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'admin@aiponge.com',
    role: 'admin',
    displayName: 'aiponge admin',
    isSystemAccount: true,
  },
];

const TEST_USERS = [
  {
    id: 'd18c0e6f-46fe-4f84-8d1b-e88037ca9417',
    email: 'coach@aiponge.com',
    role: 'user',
    displayName: 'Coach User',
    firstName: 'Coach',
    lastName: 'Test',
    subscriptionTier: 'studio',
    startingCredits: 500,
  },
  {
    id: 'a3c05a08-5995-4c07-8ca7-ad046d4b9910',
    email: 'user@aiponge.com',
    role: 'user',
    displayName: 'Personal User',
    firstName: 'User',
    lastName: 'Test',
    subscriptionTier: 'personal',
    startingCredits: 100,
  },
];

const SYSTEM_PASSWORD_HASH = '$2b$10$PLACEHOLDER_SYSTEM_ACCOUNT_NOT_FOR_LOGIN';
// Password: TestPassword123!  (bcrypt cost 10)
const TEST_USER_PASSWORD_HASH = '$2b$10$.wN.ohhZBtUSNGQn9Lg2JOCOwRy2J/0P0oJpvhmOhsEix8bjk2fDK';

type DbExec = { execute: (sql: string) => Promise<{ rows?: unknown[] }> };

export const systemUsersSeed: SeedModule = {
  name: 'system-users',
  description: 'Ensure system accounts and test users exist',
  priority: 10,
  dependencies: [],
  version: '1.1.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as DbExec;

    for (const user of SYSTEM_USERS) {
      const existing = await db.execute(`SELECT id FROM usr_accounts WHERE id = '${user.id}'`);

      if (existing?.rows?.length) {
        result.skipped++;
        result.details!.push(`${user.role} (${user.email}) already exists`);
        continue;
      }

      await db.execute(
        `INSERT INTO usr_accounts (id, email, password_hash, role, status, is_system_account, profile, email_verified)
         VALUES ('${user.id}', '${user.email}', '${SYSTEM_PASSWORD_HASH}', '${user.role}', 'active', true,
         '{"displayName": "${user.displayName}"}'::jsonb, true)
         ON CONFLICT (id) DO NOTHING`
      );

      result.created++;
      result.details!.push(`Created ${user.role}: ${user.email}`);
    }

    for (const user of TEST_USERS) {
      const existing = await db.execute(`SELECT id FROM usr_accounts WHERE id = '${user.id}'`);

      if (existing?.rows?.length) {
        await db.execute(`UPDATE usr_accounts SET is_system_account = true WHERE id = '${user.id}'`);
        result.skipped++;
        result.details!.push(`test user (${user.email}) already exists`);
        continue;
      }

      await db.execute(
        `INSERT INTO usr_accounts (id, email, password_hash, role, status, is_system_account, profile, email_verified, is_guest)
         VALUES ('${user.id}', '${user.email}', '${TEST_USER_PASSWORD_HASH}', '${user.role}', 'active', true,
         '{"displayName": "${user.displayName}", "firstName": "${user.firstName}", "lastName": "${user.lastName}"}'::jsonb, true, false)
         ON CONFLICT (id) DO UPDATE SET is_system_account = true`
      );

      await db.execute(
        `INSERT INTO usr_profiles (user_id, onboarding_initialized)
         VALUES ('${user.id}', true)
         ON CONFLICT DO NOTHING`
      );

      await db.execute(
        `INSERT INTO usr_subscriptions (user_id, subscription_tier, status, current_period_start, current_period_end)
         VALUES ('${user.id}', '${user.subscriptionTier}', 'active', NOW(), NOW() + INTERVAL '1 year')
         ON CONFLICT DO NOTHING`
      );

      await db.execute(
        `INSERT INTO usr_user_credits (user_id, starting_balance, current_balance, total_spent)
         VALUES ('${user.id}', ${user.startingCredits}, ${user.startingCredits}, 0)
         ON CONFLICT DO NOTHING`
      );

      await db.execute(
        `INSERT INTO usr_creator_members (creator_id, member_id, status, accepted_at)
         VALUES ('${user.id}', '${user.id}', 'active', NOW())
         ON CONFLICT DO NOTHING`
      );

      await db.execute(
        `INSERT INTO usr_creator_members (creator_id, member_id, status, accepted_at)
         SELECT a.id, '${user.id}', 'active', NOW()
         FROM usr_accounts a WHERE a.role = 'librarian'
         ON CONFLICT DO NOTHING`
      );

      const bookCheck = await db.execute(
        `SELECT id FROM lib_books WHERE user_id = '${user.id}' AND system_type = 'default'`
      );
      if (!bookCheck?.rows?.length) {
        await db.execute(
          `INSERT INTO lib_books (type_id, title, description, user_id, is_read_only, visibility, status, system_type)
           VALUES ('personal', 'My Story', 'Your personal space for reflection and growth', '${user.id}', false, 'personal', 'active', 'default')`
        );
        await db.execute(
          `INSERT INTO lib_chapters (book_id, user_id, title, description, sort_order)
           VALUES ((SELECT id FROM lib_books WHERE user_id = '${user.id}' AND system_type = 'default'), '${user.id}', 'My Entries', 'Your personal entries', 0)`
        );
      }

      result.created++;
      result.details!.push(`Created test user: ${user.email} (${user.subscriptionTier} tier)`);
    }

    return result;
  },
};
