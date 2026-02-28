import { z } from 'zod';
import { UUIDSchema, DateStringSchema } from './base';
import { UserSchema } from './user';

export const AuthTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number().optional(),
  tokenType: z.string().optional(),
});

export const AuthUserSchema = UserSchema.extend({
  profile: z
    .object({
      onboardingInitialized: z.boolean().optional(),
      totalEntries: z.number().optional(),
      totalInsights: z.number().optional(),
      totalReflections: z.number().optional(),
    })
    .optional(),
  subscription: z
    .object({
      tier: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
  organization: z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().optional(),
      branding: z
        .object({
          organizationName: z.string().optional(),
          displayName: z.string().optional(),
          logoUrl: z.string().optional(),
          tagline: z.string().optional(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional(),
        })
        .optional(),
    })
    .optional()
    .nullable(),
});

export const LoginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: AuthUserSchema,
    token: z.string(),
    refreshToken: z.string().optional(),
    sessionId: z.string().optional(),
  }),
});

export const RegisterResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: AuthUserSchema,
    token: z.string(),
    refreshToken: z.string().optional(),
    sessionId: z.string().optional(),
    message: z.string().optional(),
  }),
});

export const GuestResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: AuthUserSchema,
    token: z.string(),
    refreshToken: z.string().optional(),
    sessionId: z.string().optional(),
  }),
});

export const MeResponseSchema = z.object({
  success: z.literal(true),
  data: AuthUserSchema,
});

export const RefreshTokenResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresIn: z.number().optional(),
  }),
});

export const LogoutResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const GuestConversionStateSchema = z.object({
  success: z.literal(true),
  data: z.object({
    isGuest: z.boolean(),
    hasEmail: z.boolean(),
    hasPassword: z.boolean(),
    canConvert: z.boolean(),
    entriesCount: z.number().optional(),
    insightsCount: z.number().optional(),
    tracksCount: z.number().optional(),
  }),
});

export const GuestConversionPolicySchema = z.object({
  success: z.literal(true),
  data: z.object({
    maxGuestEntries: z.number(),
    maxGuestInsights: z.number(),
    maxGuestTracks: z.number(),
    warningThreshold: z.number(),
  }),
});

export const SmsCodeSendResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      codeSent: z.boolean().optional(),
      expiresAt: z.string().optional(),
    })
    .optional(),
});

export const SmsCodeVerifyResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      verified: z.boolean(),
      token: z.string().optional(),
    })
    .optional(),
  user: AuthUserSchema.optional(),
  token: z.string().optional(),
});

export const DeleteAccountResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const PasswordResetRequestResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const PasswordResetConfirmResponseSchema = z.object({
  success: z.literal(true),
  token: z.string().optional(),
  message: z.string().optional(),
});

export const PasswordChangeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export type AuthToken = z.infer<typeof AuthTokenSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export type GuestResponse = z.infer<typeof GuestResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
