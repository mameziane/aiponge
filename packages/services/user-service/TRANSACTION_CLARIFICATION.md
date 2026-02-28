# Transaction Implementation Clarification

## Schema Architecture

The aiponge user/profile system uses TWO tables:

### 1. `usr_accounts` - User Authentication + Profile Data (JSONB)
```typescript
export const users = pgTable('usr_accounts', {
  id: uuid('id').primaryKey(),
  email: varchar('email').notNull().unique(),
  passwordHash: varchar('password_hash').notNull(),
  role: varchar('role').notNull(),
  status: varchar('status').notNull(),
  profile: jsonb('profile').notNull(),  // ← firstName, lastName, displayName, onboardingCompleted
  preferences: jsonb('preferences').default({}),
  // ...
});
```

### 2. `usr_profiles` - Profile Metrics
```typescript
export const usrProfiles = pgTable('usr_profiles', {
  userId: uuid('user_id').primaryKey(),
  totalJourneys: integer('total_journeys').default(0).notNull(),      // ← DB default
  totalInsights: integer('total_insights').default(0).notNull(),      // ← DB default
  totalReflections: integer('total_reflections').default(0).notNull(),// ← DB default
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),      // ← DB default
  createdAt: timestamp('created_at').defaultNow().notNull(),          // ← DB default
});
```

## Transaction Flow

### RegisterUserUseCase prepares profile data:
```typescript
const user = await this.authRepo.registerUserWithProfile({
  id: randomUUID(),
  email: email.toLowerCase(),
  passwordHash,
  role,
  status: 'active',
  profile: {                                    // ← JSONB data
    firstName: firstName || '',
    lastName: lastName || '',
    displayName: '...',
    onboardingCompleted: false
  },
  emailVerified: false
});
```

### AuthRepository executes atomic transaction:
```typescript
await this.db.transaction(async (tx) => {
  // 1. Create user WITH profile JSONB data
  const [user] = await tx.insert(users).values(userData).returning();
  // userData includes profile: { firstName, lastName, displayName, ... }
  
  // 2. Create profile metrics record (defaults filled by DB)
  await tx.insert(usrProfiles).values({ userId: user.id });
  // Only userId needed - DB fills totalJourneys=0, totalInsights=0, etc.
  
  return user;
});
```

## Why This Works

1. **Profile personal data** (firstName, lastName, displayName) → Stored in `users.profile` JSONB ✓
2. **Profile metrics** (totalJourneys, totalInsights) → Stored in `usrProfiles` with DB defaults ✓
3. **Atomic** → Both inserts in single transaction, rollback on failure ✓
4. **No data loss** → All profile fields from RegisterUserRequest are preserved ✓

## Original Implementation (for comparison)

**Before (non-atomic)**:
```typescript
const user = await this.authRepo.createUser({
  profile: { firstName, lastName, displayName, ... }  // JSONB
});
await this.profileRepo.createProfile({ userId: user.id });  // Metrics only
```

**After (atomic)**:
```typescript
const user = await this.authRepo.registerUserWithProfile({
  profile: { firstName, lastName, displayName, ... }  // JSONB - SAME
});
// Inside registerUserWithProfile:
//   tx.insert(users).values({ profile: {...} })  // JSONB preserved
//   tx.insert(usrProfiles).values({ userId })    // Metrics with defaults
```

**Conclusion**: The transaction implementation is correct and equivalent to the original flow, with the critical addition of atomicity.
