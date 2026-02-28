import type { AuthContext } from './auth-context.js';
import type { ContentVisibility } from './status-types.js';
import type { TierId } from './subscription-tiers.js';
import { CONTENT_VISIBILITY } from './status-types.js';
import { contextIsAdmin, contextIsLibrarian, contextIsPrivileged } from './auth-context.js';
import { isPaidTier } from './subscription-tiers.js';

export interface ContentAccessContext extends AuthContext {
  accessibleCreatorIds: string[];
  sharedContentIds: string[];
  tier: TierId;
}

export interface ContentResource {
  contentId?: string;
  ownerId: string;
  visibility: ContentVisibility | string;
}

export function buildContentAccessContext(
  auth: AuthContext,
  accessibleCreatorIds: string[],
  tier: TierId,
  sharedContentIds: string[] = []
): ContentAccessContext {
  return {
    ...auth,
    accessibleCreatorIds,
    sharedContentIds,
    tier,
  };
}

export function canViewContent(resource: ContentResource, context: ContentAccessContext): boolean {
  if (contextIsAdmin(context)) return true;

  if (resource.ownerId === context.userId) return true;

  if (resource.visibility === CONTENT_VISIBILITY.PUBLIC) {
    return true;
  }

  if (resource.visibility === CONTENT_VISIBILITY.SHARED) {
    if (resource.contentId && context.sharedContentIds.includes(resource.contentId)) {
      return true;
    }
    return context.accessibleCreatorIds.includes(resource.ownerId);
  }

  return false;
}

export function canEditContent(resource: ContentResource, context: ContentAccessContext): boolean {
  if (contextIsAdmin(context)) return true;

  if (resource.ownerId === context.userId) return true;

  if (isContentPubliclyAccessible(resource.visibility) && contextIsLibrarian(context)) {
    return true;
  }

  return false;
}

export function canDeleteContent(resource: ContentResource, context: ContentAccessContext): boolean {
  if (contextIsAdmin(context)) return true;

  if (resource.ownerId === context.userId) return true;

  if (isContentPubliclyAccessible(resource.visibility) && contextIsLibrarian(context)) {
    return true;
  }

  return false;
}

export function isOwner(resource: ContentResource, context: ContentAccessContext): boolean {
  return resource.ownerId === context.userId;
}

export function isAccessibleCreator(resource: ContentResource, context: ContentAccessContext): boolean {
  return context.accessibleCreatorIds.includes(resource.ownerId);
}

export function canAccessPremiumContent(context: ContentAccessContext): boolean {
  if (contextIsPrivileged(context)) return true;
  return isPaidTier(context.tier);
}

/**
 * Check if visibility is PERSONAL (visible only to creator).
 */
export function isContentPersonal(visibility: ContentVisibility | string): boolean {
  return visibility === CONTENT_VISIBILITY.PERSONAL;
}

/**
 * Check if visibility is strictly PUBLIC only.
 * For access control, prefer `isContentPubliclyAccessible()` which handles both SHARED and PUBLIC.
 */
export function isContentPublic(visibility: ContentVisibility | string): boolean {
  return visibility === CONTENT_VISIBILITY.PUBLIC;
}

/**
 * Check if content is publicly accessible (SHARED or PUBLIC).
 * This is the primary function for access control and routing decisions.
 */
export function isContentPubliclyAccessible(visibility: ContentVisibility | string): boolean {
  return visibility === CONTENT_VISIBILITY.SHARED || visibility === CONTENT_VISIBILITY.PUBLIC;
}
