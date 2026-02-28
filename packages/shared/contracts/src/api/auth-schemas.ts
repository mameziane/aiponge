import { z } from 'zod';
import { VALID_ROLES, BrandingSchema } from '../common/index.js';
import type { UserRole } from '../common/index.js';

export const UserRoleSchema = z.enum(VALID_ROLES as unknown as [string, ...string[]]);

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
  birthdate: z.string().optional(),
  avatarUrl: z.string().optional(),
  role: UserRoleSchema,
  isGuest: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  phoneNumber: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  organizationId: z.string().uuid().optional().nullable(),
  organizationBranding: BrandingSchema.optional().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthMeResponseSchema = z.object({
  success: z.boolean(),
  user: AuthUserSchema.optional(),
  error: z.string().optional(),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
