import {
  createAuthContext,
  buildContentAccessContext,
  TIER_IDS,
  type UserRole,
  type AuthContext,
  type ContentAccessContext,
  type TierId,
} from '@aiponge/shared-contracts';

export type { UserRole, AuthContext, ContentAccessContext };

export function createContentAccessContext(
  userId: string,
  role: string,
  accessibleCreatorIds: string[] = [],
  tier: TierId = TIER_IDS.GUEST,
  sharedContentIds: string[] = []
): ContentAccessContext {
  const auth = createAuthContext(userId, role);
  return buildContentAccessContext(auth, accessibleCreatorIds, tier, sharedContentIds);
}
