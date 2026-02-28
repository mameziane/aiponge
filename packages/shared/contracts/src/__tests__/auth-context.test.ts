/**
 * Unit Tests for AuthContext and Policy Utilities
 * Tests the centralized authorization system
 */

import { describe, it, expect } from 'vitest';
import {
  createAuthContext,
  createAuthContextFromHeaders,
  hasRole,
  hasAnyRole,
  contextIsPrivileged,
  contextIsAdmin,
  contextIsLibrarian,
  hasPermission,
  hasAnyPermission,
  canEditSharedContent,
  canAccessAdminFeatures,
  PERMISSION,
  USER_ROLES,
  PRIVILEGED_ROLES,
  type AuthContext,
} from '../common/auth-context';

describe('AuthContext', () => {
  describe('createAuthContext', () => {
    it('should create a valid AuthContext with defaults', () => {
      const ctx = createAuthContext('user-123', USER_ROLES.USER);

      expect(ctx.userId).toBe('user-123');
      expect(ctx.role).toBe(USER_ROLES.USER);
      expect(ctx.isAuthenticated).toBe(true);
      expect(ctx.isGuest).toBe(false);
    });

    it('should create a guest context when isGuest is true', () => {
      const ctx = createAuthContext('guest-123', USER_ROLES.USER, true);

      expect(ctx.isGuest).toBe(true);
    });
  });

  describe('createAuthContextFromHeaders', () => {
    it('should create AuthContext from valid headers', () => {
      const headers = {
        'x-user-id': 'user-456',
        'x-user-role': 'admin',
      };

      const ctx = createAuthContextFromHeaders(headers);

      expect(ctx.userId).toBe('user-456');
      expect(ctx.role).toBe(USER_ROLES.ADMIN);
      expect(ctx.isAuthenticated).toBe(true);
    });

    it('should normalize role to lowercase', () => {
      const headers = {
        'x-user-id': 'user-456',
        'x-user-role': 'Librarian',
      };

      const ctx = createAuthContextFromHeaders(headers);

      expect(ctx.role).toBe(USER_ROLES.LIBRARIAN);
    });

    it('should default to user role for invalid roles', () => {
      const headers = {
        'x-user-id': 'user-789',
        'x-user-role': 'invalid-role',
      };

      const ctx = createAuthContextFromHeaders(headers);

      expect(ctx.role).toBe(USER_ROLES.USER);
    });

    it('should handle missing headers gracefully', () => {
      const headers = {};

      const ctx = createAuthContextFromHeaders(headers);

      expect(ctx.userId).toBe('');
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.role).toBe(USER_ROLES.USER);
    });

    it('should detect guest users from header', () => {
      const headers = {
        'x-user-id': 'guest-123',
        'x-user-role': 'user',
        'x-user-is-guest': 'true',
      };

      const ctx = createAuthContextFromHeaders(headers);

      expect(ctx.isGuest).toBe(true);
    });
  });

  describe('Role Checking Functions', () => {
    const adminCtx = createAuthContext('admin', USER_ROLES.ADMIN);
    const librarianCtx = createAuthContext('librarian', USER_ROLES.LIBRARIAN);
    const userCtx = createAuthContext('user', USER_ROLES.USER);

    describe('hasRole', () => {
      it('should return true when context has matching role', () => {
        expect(hasRole(adminCtx, USER_ROLES.ADMIN)).toBe(true);
        expect(hasRole(librarianCtx, USER_ROLES.LIBRARIAN)).toBe(true);
      });

      it('should return false when context has different role', () => {
        expect(hasRole(adminCtx, USER_ROLES.USER)).toBe(false);
        expect(hasRole(userCtx, USER_ROLES.ADMIN)).toBe(false);
      });
    });

    describe('hasAnyRole', () => {
      it('should return true when context has one of the roles', () => {
        expect(hasAnyRole(adminCtx, PRIVILEGED_ROLES)).toBe(true);
        expect(hasAnyRole(librarianCtx, PRIVILEGED_ROLES)).toBe(true);
      });

      it('should return false when context has none of the roles', () => {
        expect(hasAnyRole(userCtx, PRIVILEGED_ROLES)).toBe(false);
      });
    });

    describe('contextIsPrivileged', () => {
      it('should return true for admin and librarian', () => {
        expect(contextIsPrivileged(adminCtx)).toBe(true);
        expect(contextIsPrivileged(librarianCtx)).toBe(true);
      });

      it('should return false for non-privileged roles', () => {
        expect(contextIsPrivileged(userCtx)).toBe(false);
      });
    });

    describe('contextIsAdmin', () => {
      it('should return true only for admin', () => {
        expect(contextIsAdmin(adminCtx)).toBe(true);
        expect(contextIsAdmin(librarianCtx)).toBe(false);
        expect(contextIsAdmin(userCtx)).toBe(false);
      });
    });

    describe('contextIsLibrarian', () => {
      it('should return true only for librarian', () => {
        expect(contextIsLibrarian(librarianCtx)).toBe(true);
        expect(contextIsLibrarian(adminCtx)).toBe(false);
        expect(contextIsLibrarian(userCtx)).toBe(false);
      });
    });
  });

  describe('Permission Checking Functions', () => {
    const adminCtx = createAuthContext('admin', USER_ROLES.ADMIN);
    const librarianCtx = createAuthContext('librarian', USER_ROLES.LIBRARIAN);
    const userCtx = createAuthContext('user', USER_ROLES.USER);

    describe('hasPermission', () => {
      it('should return true when role has the permission', () => {
        expect(hasPermission(adminCtx, PERMISSION.MANAGE_USERS)).toBe(true);
        expect(hasPermission(librarianCtx, PERMISSION.EDIT_SHARED_CONTENT)).toBe(true);
        expect(hasPermission(userCtx, PERMISSION.CREATE_CONTENT)).toBe(true);
      });

      it('should return false when role lacks the permission', () => {
        expect(hasPermission(userCtx, PERMISSION.MANAGE_USERS)).toBe(false);
        expect(hasPermission(userCtx, PERMISSION.EDIT_SHARED_CONTENT)).toBe(false);
        expect(hasPermission(userCtx, PERMISSION.ACCESS_PREMIUM)).toBe(false);
      });
    });

    describe('hasAnyPermission', () => {
      it('should return true when role has any of the permissions', () => {
        expect(hasAnyPermission(librarianCtx, [PERMISSION.MANAGE_USERS, PERMISSION.EDIT_SHARED_CONTENT])).toBe(true);
      });

      it('should return false when role has none of the permissions', () => {
        expect(hasAnyPermission(userCtx, [PERMISSION.MANAGE_USERS, PERMISSION.DELETE_SHARED_CONTENT])).toBe(false);
      });
    });

    describe('canEditSharedContent', () => {
      it('should return true for librarian and admin', () => {
        expect(canEditSharedContent(adminCtx)).toBe(true);
        expect(canEditSharedContent(librarianCtx)).toBe(true);
      });

      it('should return false for regular users', () => {
        expect(canEditSharedContent(userCtx)).toBe(false);
      });
    });

    describe('canAccessAdminFeatures', () => {
      it('should return true only for admin', () => {
        expect(canAccessAdminFeatures(adminCtx)).toBe(true);
      });

      it('should return false for non-admin roles', () => {
        expect(canAccessAdminFeatures(librarianCtx)).toBe(false);
        expect(canAccessAdminFeatures(userCtx)).toBe(false);
      });
    });
  });

  describe('Case Sensitivity Bug Fix', () => {
    it('should normalize mixed-case roles from headers', () => {
      const testCases = [
        { input: 'Admin', expected: USER_ROLES.ADMIN },
        { input: 'ADMIN', expected: USER_ROLES.ADMIN },
        { input: 'admin', expected: USER_ROLES.ADMIN },
        { input: 'Librarian', expected: USER_ROLES.LIBRARIAN },
        { input: 'LIBRARIAN', expected: USER_ROLES.LIBRARIAN },
        { input: 'librarian', expected: USER_ROLES.LIBRARIAN },
        { input: 'User', expected: USER_ROLES.USER },
        { input: 'USER', expected: USER_ROLES.USER },
        { input: 'user', expected: USER_ROLES.USER },
      ];

      for (const { input, expected } of testCases) {
        const ctx = createAuthContextFromHeaders({
          'x-user-id': 'user-123',
          'x-user-role': input,
        });
        expect(ctx.role).toBe(expected);
      }
    });

    it('should correctly identify privileged roles regardless of original case', () => {
      const librarianCtxFromMixedCase = createAuthContextFromHeaders({
        'x-user-id': 'user-123',
        'x-user-role': 'Librarian',
      });

      expect(contextIsPrivileged(librarianCtxFromMixedCase)).toBe(true);
      expect(canEditSharedContent(librarianCtxFromMixedCase)).toBe(true);
    });
  });
});
