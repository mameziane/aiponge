/**
 * Shared persistence types for music generation
 */

import { isContentPubliclyAccessible, type ContentVisibility } from '@aiponge/shared-contracts';

export type { ContentVisibility };

export interface PersistenceContext {
  visibility: ContentVisibility;
  userId?: string;
  albumId?: string;
}

/**
 * Check if the persistence context targets publicly accessible content (SHARED or PUBLIC).
 * Used to route storage to catalog (shared library) vs user-specific repositories.
 */
export function isPubliclyAccessibleContext(ctx?: PersistenceContext): boolean {
  return !!ctx && isContentPubliclyAccessible(ctx.visibility);
}
