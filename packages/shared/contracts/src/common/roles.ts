/**
 * User Roles - Single Source of Truth
 * All services should import from @aiponge/shared-contracts
 *
 * IMPORTANT: Roles are for AUTHORIZATION (what can you do?)
 * For subscription/feature access, use SubscriptionTier from subscription-tiers.ts
 *
 * Role definitions:
 * - ADMIN: Full system administration privileges
 * - LIBRARIAN: Content management for shared library
 * - USER: Regular authenticated user (default for all new registrations)
 */

export const USER_ROLES = {
  ADMIN: 'admin',
  LIBRARIAN: 'librarian',
  USER: 'user',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const VALID_ROLES: readonly UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.LIBRARIAN, USER_ROLES.USER] as const;

/** Roles with elevated permissions */
export const PRIVILEGED_ROLES: readonly UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.LIBRARIAN] as const;

export function isValidRole(role: string): role is UserRole {
  return VALID_ROLES.includes(role as UserRole);
}

/**
 * Normalize role string to UserRole
 * Handles case-insensitivity and defaults to USER for invalid roles
 */
export function normalizeRole(role: string | undefined | null): UserRole {
  if (!role) {
    return USER_ROLES.USER;
  }

  const lowerRole = role.toLowerCase();

  if (isValidRole(lowerRole)) {
    return lowerRole;
  }

  return USER_ROLES.USER;
}

export function isAdmin(role: UserRole): boolean {
  return role === USER_ROLES.ADMIN;
}

export function isLibrarian(role: UserRole): boolean {
  return role === USER_ROLES.LIBRARIAN;
}

export function isPrivilegedRole(role: UserRole): boolean {
  return PRIVILEGED_ROLES.includes(role);
}

/** Check if role is a regular user (not admin/librarian) */
export function isRegularUser(role: UserRole): boolean {
  return !isPrivilegedRole(role);
}
