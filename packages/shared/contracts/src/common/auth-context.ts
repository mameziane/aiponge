/**
 * AuthContext - Centralized Authorization Context
 *
 * Single source of truth for user authentication state across all services.
 * Eliminates scattered role checks and ensures consistent authorization.
 *
 * Usage:
 * - API Gateway creates AuthContext from JWT claims
 * - Services receive AuthContext via headers (signed by gateway)
 * - All authorization decisions use AuthContext + PolicyGuards
 */

import { USER_ROLES, PRIVILEGED_ROLES, normalizeRole, type UserRole } from './roles.js';

export interface AuthContext {
  userId: string;
  role: UserRole;
  isAuthenticated: boolean;
  isGuest: boolean;
}

export interface JWTClaims {
  id?: string;
  sub?: string;
  role?: string;
  roles?: string[];
  email?: string;
  isGuest?: boolean;
  iat?: number;
  exp?: number;
}

export const PERMISSION = {
  MANAGE_USERS: 'manage_users',
  MANAGE_LIBRARY: 'manage_library',
  MANAGE_MUSIC: 'manage_music',
  CREATE_CONTENT: 'create_content',
  EDIT_SHARED_CONTENT: 'edit_shared_content',
  DELETE_SHARED_CONTENT: 'delete_shared_content',
  VIEW_ANALYTICS: 'view_analytics',
  GENERATE_CONTENT: 'generate_content',
  UNLIMITED_GENERATIONS: 'unlimited_generations',
  ACCESS_PREMIUM: 'access_premium',
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [USER_ROLES.ADMIN]: [
    PERMISSION.MANAGE_USERS,
    PERMISSION.MANAGE_LIBRARY,
    PERMISSION.MANAGE_MUSIC,
    PERMISSION.CREATE_CONTENT,
    PERMISSION.EDIT_SHARED_CONTENT,
    PERMISSION.DELETE_SHARED_CONTENT,
    PERMISSION.VIEW_ANALYTICS,
    PERMISSION.GENERATE_CONTENT,
    PERMISSION.UNLIMITED_GENERATIONS,
    PERMISSION.ACCESS_PREMIUM,
  ],
  [USER_ROLES.LIBRARIAN]: [
    PERMISSION.MANAGE_LIBRARY,
    PERMISSION.CREATE_CONTENT,
    PERMISSION.EDIT_SHARED_CONTENT,
    PERMISSION.DELETE_SHARED_CONTENT,
    PERMISSION.VIEW_ANALYTICS,
    PERMISSION.GENERATE_CONTENT,
    PERMISSION.UNLIMITED_GENERATIONS,
    PERMISSION.ACCESS_PREMIUM,
  ],
  [USER_ROLES.USER]: [PERMISSION.CREATE_CONTENT, PERMISSION.GENERATE_CONTENT],
} as const;

export function createAuthContext(
  userId: string,
  rawRole: string | undefined | null,
  isGuest: boolean = false
): AuthContext {
  const role = normalizeRole(rawRole);
  return {
    userId,
    role,
    isAuthenticated: !!userId && userId.length > 0,
    isGuest,
  };
}

export function createAuthContextFromClaims(claims: JWTClaims | null | undefined): AuthContext {
  if (!claims) {
    return createGuestContext();
  }

  const userId = claims.id || claims.sub || '';
  const rawRole = claims.role || claims.roles?.[0];
  const isGuest = claims.isGuest ?? false;

  return createAuthContext(userId, rawRole, isGuest);
}

export function createGuestContext(): AuthContext {
  return {
    userId: '',
    role: USER_ROLES.USER,
    isAuthenticated: false,
    isGuest: true,
  };
}

export function createAuthContextFromHeaders(headers: {
  'x-user-id'?: string;
  'x-user-role'?: string;
  'x-user-is-guest'?: string;
}): AuthContext {
  const userId = headers['x-user-id'] || '';
  const rawRole = headers['x-user-role'];
  const isGuest = headers['x-user-is-guest'] === 'true';

  return createAuthContext(userId, rawRole, isGuest);
}

export function authContextToHeaders(ctx: AuthContext): Record<string, string> {
  return {
    'x-user-id': ctx.userId,
    'x-user-role': ctx.role,
    'x-user-is-guest': ctx.isGuest ? 'true' : 'false',
  };
}

export function hasRole(ctx: AuthContext, role: UserRole): boolean {
  return ctx.role === role;
}

export function hasAnyRole(ctx: AuthContext, roles: readonly UserRole[]): boolean {
  return roles.includes(ctx.role);
}

export function contextIsPrivileged(ctx: AuthContext): boolean {
  return hasAnyRole(ctx, PRIVILEGED_ROLES);
}

export function contextIsAdmin(ctx: AuthContext): boolean {
  return hasRole(ctx, USER_ROLES.ADMIN);
}

export function contextIsLibrarian(ctx: AuthContext): boolean {
  return hasRole(ctx, USER_ROLES.LIBRARIAN);
}

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  const normalizedRole = normalizeRole(ctx.role);
  const rolePermissions = ROLE_PERMISSIONS[normalizedRole] ?? ROLE_PERMISSIONS[USER_ROLES.USER];
  return rolePermissions.includes(permission);
}

export function hasAllPermissions(ctx: AuthContext, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(ctx, p));
}

export function hasAnyPermission(ctx: AuthContext, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(ctx, p));
}

export function canEditSharedContent(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSION.EDIT_SHARED_CONTENT);
}

export function canDeleteSharedContent(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSION.DELETE_SHARED_CONTENT);
}

export function canAccessAdminFeatures(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSION.MANAGE_USERS);
}

export { USER_ROLES, PRIVILEGED_ROLES, normalizeRole } from './roles.js';
export type { UserRole } from './roles.js';
