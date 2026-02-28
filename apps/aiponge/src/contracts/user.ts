import { z } from 'zod';
import { ApiResponseSchema, UUIDSchema, DateStringSchema, NullableStringSchema } from './base';

export const BrandingSchema = z.object({
  organizationName: z.string().optional(),
  displayName: z.string().optional(),
  logoUrl: z.string().optional(),
  tagline: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
});

export const UserSchema = z.object({
  id: UUIDSchema,
  email: z.string().email().optional().nullable(),
  role: z.string(),
  status: z.string().optional(),
  isGuest: z.boolean().optional(),
  isSystemAccount: z.boolean().optional(),
  organizationId: UUIDSchema.optional().nullable(),
  organizationBranding: BrandingSchema.optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  phoneE164: z.string().optional().nullable(),
  phoneVerified: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  preferredAuthChannel: z.string().optional().nullable(),
  lastLoginAt: DateStringSchema.optional().nullable(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const UserProfileSchema = z.object({
  userId: UUIDSchema,
  totalInsights: z.number().optional(),
  totalReflections: z.number().optional(),
  totalEntries: z.number().optional(),
  onboardingInitialized: z.boolean().optional(),
  lastVisitedRoute: z.string().optional().nullable(),
  lastUpdated: DateStringSchema.optional(),
  createdAt: DateStringSchema.optional(),
});

export const SubscriptionSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  revenuecatCustomerId: z.string().optional().nullable(),
  subscriptionTier: z.string(),
  status: z.string(),
  platform: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  entitlementId: z.string().optional().nullable(),
  currentPeriodStart: DateStringSchema.optional().nullable(),
  currentPeriodEnd: DateStringSchema.optional().nullable(),
  cancelAtPeriodEnd: z.boolean().optional(),
  trialEnd: DateStringSchema.optional().nullable(),
  billingIssue: z.boolean().optional(),
  lastSyncedAt: DateStringSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const UserCreditsSchema = z.object({
  userId: UUIDSchema,
  startingBalance: z.number(),
  currentBalance: z.number(),
  totalSpent: z.number().optional(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const CreditBalanceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    balance: z.number(),
    startingBalance: z.number().optional(),
    totalSpent: z.number().optional(),
  }),
});

export const CreditPolicyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    costs: z.record(z.number()),
    descriptions: z.record(z.string()).optional(),
  }),
});

export const InsightSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  entryId: UUIDSchema.optional().nullable(),
  type: z.string(),
  title: z.string(),
  content: z.string(),
  confidence: z.number().optional().nullable(),
  category: z.string().optional().nullable(),
  themes: z.array(z.string()).optional(),
  actionable: z.boolean().optional(),
  priority: z.number().optional().nullable(),
  aiProvider: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
  generatedAt: DateStringSchema.optional().nullable(),
  validatedAt: DateStringSchema.optional().nullable(),
  validatedBy: UUIDSchema.optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: DateStringSchema.optional(),
});

export const ReflectionSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  challengeQuestion: z.string(),
  userResponse: z.string(),
  followUpQuestions: z.array(z.string()).optional(),
  isBreakthrough: z.boolean().optional(),
  engagementLevel: z.string().optional().nullable(),
  responseTime: z.number().optional().nullable(),
  submittedAt: DateStringSchema.optional().nullable(),
  createdAt: DateStringSchema.optional(),
});

export const ReminderSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  reminderType: z.string(),
  title: z.string().optional().nullable(),
  enabled: z.boolean(),
  timezone: z.string().optional().nullable(),
  timeOfDay: z.string().optional().nullable(),
  repeatType: z.string().optional().nullable(),
  daysOfWeek: z.array(z.number()).optional(),
  dayOfMonth: z.number().optional().nullable(),
  baseDate: DateStringSchema.optional().nullable(),
  notifyEnabled: z.boolean().optional(),
  autoPlayEnabled: z.boolean().optional(),
  prompt: z.string().optional().nullable(),
  bookId: UUIDSchema.optional().nullable(),
  trackId: UUIDSchema.optional().nullable(),
  userTrackId: UUIDSchema.optional().nullable(),
  trackTitle: z.string().optional().nullable(),
  lastTriggeredAt: DateStringSchema.optional().nullable(),
  createdAt: DateStringSchema.optional(),
  updatedAt: DateStringSchema.optional(),
});

export const ProfileResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      user: UserSchema.optional(),
      profile: UserProfileSchema.optional(),
      subscription: SubscriptionSchema.optional(),
      credits: z
        .object({
          balance: z.number(),
          startingBalance: z.number().optional(),
        })
        .optional(),
    })
    .or(UserProfileSchema),
});

export const ListInsightsResponseSchema = ApiResponseSchema(z.array(InsightSchema));
export const ListReflectionsResponseSchema = ApiResponseSchema(z.array(ReflectionSchema));
export const ListRemindersResponseSchema = ApiResponseSchema(z.array(ReminderSchema));

export const InsightResponseSchema = ApiResponseSchema(InsightSchema);
export const ReflectionResponseSchema = ApiResponseSchema(ReflectionSchema);
export const ReminderResponseSchema = ApiResponseSchema(ReminderSchema);

export const WellnessScoreSchema = z.object({
  overallScore: z.number(),
  dimensions: z.record(z.number()).optional(),
  trend: z.string().optional(),
  lastCalculatedAt: DateStringSchema.optional(),
});

export const WellnessResponseSchema = z.object({
  success: z.literal(true),
  data: WellnessScoreSchema,
});

export const PreferencesSchema = z.object({
  language: z.string().optional(),
  timezone: z.string().optional(),
  theme: z.string().optional(),
  notifications: z
    .object({
      push: z.boolean().optional(),
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
    })
    .optional(),
  visibility: z
    .object({
      shareAnonymousData: z.boolean().optional(),
      allowResearch: z.boolean().optional(),
    })
    .optional(),
});

export const PreferencesResponseSchema = z.object({
  success: z.literal(true),
  data: PreferencesSchema,
});

export const CreditTransactionSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  amount: z.number(),
  type: z.string(),
  description: z.string().optional().nullable(),
  balanceAfter: z.number().optional(),
  referenceId: z.string().optional().nullable(),
  referenceType: z.string().optional().nullable(),
  createdAt: DateStringSchema.optional(),
});

export const CreditTransactionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    transactions: z.array(CreditTransactionSchema),
    total: z.number(),
  }),
});

export const CreditGrantResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    creditsGranted: z.number(),
    newBalance: z.number().optional(),
  }),
});

export const CreditValidateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    valid: z.boolean(),
    hasEnough: z.boolean().optional(),
    currentBalance: z.number().optional(),
    requiredAmount: z.number().optional(),
  }),
});

export const BookReminderResponseSchema = z.object({
  success: z.literal(true),
  data: ReminderSchema,
});

export const OnboardingCompleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const ActivityAlarmSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  type: z.string(),
  scheduledAt: DateStringSchema,
  enabled: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

export const ActivityAlarmsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(ActivityAlarmSchema),
});

export const ActivityCalendarResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    entries: z.array(
      z.object({
        date: z.string(),
        count: z.number(),
        types: z.array(z.string()).optional(),
      })
    ),
  }),
});

export const ContentGenerateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    content: z.string(),
    type: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const ReportsInsightsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    insights: z.array(InsightSchema).optional(),
    summary: z.string().optional(),
    period: z.string().optional(),
  }),
});

export type User = z.infer<typeof UserSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type UserCredits = z.infer<typeof UserCreditsSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type Reflection = z.infer<typeof ReflectionSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
