# Test Remediation Round 2

This prompt addresses all remaining issues found after the first remediation pass. The first pass improved toHaveBeenCalledWith from 223 to 338 and added timer-based tests. A thorough audit found 6 remaining issues.

## STATUS OF PREVIOUS FIXES

| Fix | Verdict |
|-----|---------|
| Fix 1 Repository assertions | PARTIALLY DONE - user-service repos still have 10 bare assertions |
| Fix 2 Use case assertions | DONE |
| Fix 3 Auth middleware | auth-integration.test.ts was never created |
| Fix 4 Timer tests | DONE |
| Fix 5 Jest cleanup | DONE |
| Fix 6 Coverage thresholds | api-gateway 30/35/35/35 too low, user-service 6/0/12/12 useless |
| Fix 7 Missing files | Only 8 of 28 route files tested, 20 missing |

## ISSUE 1 - User-service repository bare assertions (10 lines)

Replace each bare .toHaveBeenCalled() with argument verification.

packages/services/user-service/src/__tests__/repositories/CreatorMemberRepository.test.ts:
- Line 160 expect(mockDb.insert).toHaveBeenCalled()
- Line 244 expect(mockDb.update).toHaveBeenCalled()
- Line 299 expect(mockDb.update).toHaveBeenCalled()
- Line 307 expect(mockDb.delete).toHaveBeenCalled()
- Line 423 expect(mockDb.insert).toHaveBeenCalled()

packages/services/user-service/src/__tests__/repositories/GuestConversionRepository.test.ts:
- Line 235 expect(mockDb.insert).toHaveBeenCalled()
- Line 271 expect(mockDb.update).toHaveBeenCalled()

packages/services/user-service/src/__tests__/repositories/BookRepository.test.ts:
- Line 198 expect(mockDb.insert).toHaveBeenCalled()
- Line 252 expect(mockDb.update).toHaveBeenCalled()
- Line 296 expect(mockDb.delete).toHaveBeenCalled()

BookRepository uses chained mockReturnValue pattern. Capture the chain to verify arguments. If too awkward refactor to mockReturnThis pattern from music-service repos.

Run after: cd packages/services/user-service && npx vitest run src/__tests__/repositories/

## ISSUE 2 - Create auth integration test

Create: packages/services/api-gateway/src/__tests__/middleware/auth-integration.test.ts

Use supertest with real Express app. Mount jwtAuthMiddleware, adminAuthMiddleware, optionalJwtAuthMiddleware on test routes. Follow music.routes.test.ts mock setup pattern exactly. Mock StandardAuthMiddleware to simulate token validation but let middleware logic run for real.

Tests needed:
- jwtAuthMiddleware: 401 no header, 401 invalid token, 200 valid token with user context, role lowercasing
- adminAuthMiddleware: 403 non-admin, 200 admin, 401 no token
- optionalJwtAuthMiddleware: 200 guest no token, 200 with context on valid token, 200 guest on invalid token

Read jwtAuthMiddleware.ts adminAuthMiddleware.ts music.routes.test.ts first.

Run after: cd packages/services/api-gateway && npx vitest run src/__tests__/middleware/auth-integration.test.ts

## ISSUE 3 - Raise api-gateway coverage thresholds

File: packages/services/api-gateway/vitest.config.ts
Current: branches 30 functions 35 lines 35 statements 35

Run cd packages/services/api-gateway && npx vitest run --coverage. Read actual percentages. Update thresholds to actual minus 2. Confirm tests pass.

## ISSUE 4 - Raise user-service coverage thresholds

File: packages/services/user-service/vitest.config.ts
Current: branches 6 functions 0 lines 12 statements 12

Run coverage. Set to actual minus 2. Functions must end up at least 10.

## ISSUE 5 - Create 20 missing route test files

Tested (8): auth books credits entries library lyrics music playlists

Missing (20 files) - create test for each at src/__tests__/routes/[name].routes.test.ts:

In routes/app/: activity config guest-conversion init library-public lyrics-public privacy profile quote reflections reminders reports safety store subscriptions

In routes/: admin dynamic health librarian-content

Copy mock setup from music.routes.test.ts verbatim. Each test needs at minimum:
1. 401 on unauthenticated request (if auth required)
2. 200 happy path with mocked gatewayFetch
3. 400 on invalid input (if validation exists)

Read each route source file first. Priority: subscriptions profile store guest-conversion activity admin then rest.

Run after each batch of 5: cd packages/services/api-gateway && npx vitest run src/__tests__/routes/

## ISSUE 6 - Run all suites confirm zero failures

After Issues 1-5 run all 8 services. ALL must pass zero failures. Fix do not skip or delete.

## VERIFICATION

Run and report output of all 7 checks:
1. grep bare mockDb assertions - target 0
2. grep bare save/create/update - target 0
3. ls route test files - target 24+
4. ls auth-integration.test.ts - must exist
5. grep api-gateway thresholds - must be above 30/35
6. grep user-service thresholds - functions must be above 0
7. Run all 8 vitest suites - all green

Do NOT mark complete until all checks pass.
