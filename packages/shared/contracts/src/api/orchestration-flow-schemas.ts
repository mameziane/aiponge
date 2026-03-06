/**
 * Orchestration Flow API Contracts
 *
 * Zod schemas for orchestration flow endpoints (wellness, meditation, gift, journal).
 * Split routing: plan/confirm → ai-content-service, generate/regenerate → music-service.
 */

import { z } from 'zod';
import { ContentVisibilitySchema } from '../common/index.js';
import { OrchestrationFlowTypeSchema } from '../events/OrchestrationEvents.js';

// Re-export for convenience
export { OrchestrationFlowTypeSchema };

// =============================================================================
// SESSION STATUS & TRANSITIONS
// =============================================================================

export const OrchestrationSessionStatusSchema = z.enum(['planning', 'reviewing', 'confirmed', 'cancelled', 'failed']);
export type OrchestrationSessionStatus = z.infer<typeof OrchestrationSessionStatusSchema>;

/**
 * Valid session status transitions.
 * Used with assertValidTransition(from, to, transitions, 'orchestration-session').
 *
 * planning  → reviewing       (plan LLM call completes)
 * reviewing → reviewing       (re-plan on recipient toggle or transcript edit)
 * reviewing → confirmed       (creator confirms after preview)
 * reviewing → cancelled       (creator dismisses modal without confirming)
 * any       → failed          (unrecoverable error)
 */
export const ORCHESTRATION_SESSION_TRANSITIONS: Record<string, string[]> = {
  planning: ['reviewing', 'failed'],
  reviewing: ['reviewing', 'confirmed', 'cancelled', 'failed'],
  confirmed: ['failed'],
  cancelled: [],
  failed: [],
};

// =============================================================================
// SESSION OUTPUTS (completion tracking)
// =============================================================================

export const OrchestrationSessionOutputsSchema = z.object({
  bookRequestId: z.string().uuid().nullable(),
  albumRequestId: z.string().nullable().optional(),
  bookId: z.string().uuid().nullable(),
  albumId: z.string().uuid().nullable(),
  bookCompleted: z.boolean().default(false),
  albumCompleted: z.boolean().default(false),
});
export type OrchestrationSessionOutputs = z.infer<typeof OrchestrationSessionOutputsSchema>;

// =============================================================================
// PLAN INTERPRETATION (LLM output)
// =============================================================================

export const WellnessInterpretationSchema = z.object({
  summary: z.string(),
  detectedRecipientName: z.string().nullable(),
  emotionalState: z.string(),
  coreNeeds: z.array(z.string()),
});
export type WellnessInterpretation = z.infer<typeof WellnessInterpretationSchema>;

// =============================================================================
// PLAN SCHEMAS (per flow type)
// =============================================================================

export const WellnessBookPlanSchema = z.object({
  bookTypeId: z.string(),
  bookTypeName: z.string(),
  suggestedTitle: z.string(),
  chapterCount: z.number().int().min(1).max(20),
  chapterThemes: z.array(z.string()),
});
export type WellnessBookPlan = z.infer<typeof WellnessBookPlanSchema>;

export const WellnessAlbumPlanSchema = z.object({
  suggestedTitle: z.string(),
  trackCount: z.number().int().min(1).max(20),
  genres: z.array(z.string()),
  mood: z.string(),
  style: z.string(),
  moodProgression: z.string().optional(),
  basedOnPreferences: z.boolean().optional(),
});
export type WellnessAlbumPlan = z.infer<typeof WellnessAlbumPlanSchema>;

export const WellnessFirstTrackPlanSchema = z.object({
  prompt: z.string(),
  mood: z.string(),
  genre: z.string(),
  style: z.string(),
});
export type WellnessFirstTrackPlan = z.infer<typeof WellnessFirstTrackPlanSchema>;

export const WellnessPlanSchema = z.object({
  book: WellnessBookPlanSchema,
  album: WellnessAlbumPlanSchema,
  firstTrack: WellnessFirstTrackPlanSchema.optional(),
});
export type WellnessPlan = z.infer<typeof WellnessPlanSchema>;

// =============================================================================
// RECIPIENT
// =============================================================================

export const OrchestrationRecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.enum(['self', 'member']),
  visibility: ContentVisibilitySchema,
});
export type OrchestrationRecipient = z.infer<typeof OrchestrationRecipientSchema>;

export const OrchestrationMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationship: z.enum(['self', 'member']),
});
export type OrchestrationMember = z.infer<typeof OrchestrationMemberSchema>;

// =============================================================================
// PLAN REQUEST / RESPONSE
// =============================================================================

export const WellnessPlanRequestSchema = z.object({
  transcript: z.string().min(5).max(5000),
  recipientId: z.string().uuid().nullable(),
  sessionId: z.string().nullable().optional(),
});
export type WellnessPlanRequest = z.infer<typeof WellnessPlanRequestSchema>;

export const WellnessPlanResponseSchema = z.object({
  sessionId: z.string(),
  interpretation: WellnessInterpretationSchema,
  recipient: OrchestrationRecipientSchema,
  plan: WellnessPlanSchema,
  membersList: z.array(OrchestrationMemberSchema),
});
export type WellnessPlanResponse = z.infer<typeof WellnessPlanResponseSchema>;

// =============================================================================
// GENERATE PREVIEW REQUEST / RESPONSE
// =============================================================================

export const WellnessFirstTrackSchema = z.object({
  prompt: z.string().max(2000),
  mood: z.string().max(100),
  genre: z.string().max(100),
  style: z.string().max(200),
});
export type WellnessFirstTrack = z.infer<typeof WellnessFirstTrackSchema>;

export const WellnessGenerateRequestSchema = z.object({
  sessionId: z.string(),
  firstTrack: WellnessFirstTrackSchema,
});
export type WellnessGenerateRequest = z.infer<typeof WellnessGenerateRequestSchema>;

export const WellnessPreviewTrackSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  genre: z.string().optional(),
  mood: z.string().optional(),
  duration: z.number().optional(),
  streamUrl: z.string().optional(),
  artworkUrl: z.string().optional(),
  status: z.string(),
  visibility: ContentVisibilitySchema,
});
export type WellnessPreviewTrack = z.infer<typeof WellnessPreviewTrackSchema>;

export const WellnessGenerateResponseSchema = z.object({
  sessionId: z.string(),
  requestId: z.string(),
});
export type WellnessGenerateResponse = z.infer<typeof WellnessGenerateResponseSchema>;

export const WellnessGenerateStatusResponseSchema = z.object({
  status: z.enum(['processing', 'completed', 'failed']),
  phase: z.string().optional(),
  percentComplete: z.number().min(0).max(100),
  previewTrack: WellnessPreviewTrackSchema.nullable(),
  errorMessage: z.string().optional(),
});
export type WellnessGenerateStatusResponse = z.infer<typeof WellnessGenerateStatusResponseSchema>;

// =============================================================================
// CONFIRM REQUEST / RESPONSE
// =============================================================================

export const WellnessConfirmRequestSchema = z.object({
  sessionId: z.string(),
  previewTrackId: z.string().uuid(),
});
export type WellnessConfirmRequest = z.infer<typeof WellnessConfirmRequestSchema>;

export const WellnessConfirmResponseSchema = z.object({
  sessionId: z.string(),
  previewTrack: z.object({
    id: z.string().uuid(),
    status: z.string(),
    visibility: ContentVisibilitySchema,
  }),
  bookRequestId: z.string().uuid(),
  albumRequestId: z.string().nullable(),
  recipientNotified: z.boolean(),
});
export type WellnessConfirmResponse = z.infer<typeof WellnessConfirmResponseSchema>;

// =============================================================================
// REGENERATE REQUEST / RESPONSE
// =============================================================================

export const WellnessRegenerateRequestSchema = z.object({
  sessionId: z.string(),
  firstTrack: WellnessFirstTrackSchema,
  feedback: z.string().max(500).optional(),
});
export type WellnessRegenerateRequest = z.infer<typeof WellnessRegenerateRequestSchema>;

// Response is the same as WellnessGenerateResponseSchema

// =============================================================================
// FULL LLM PLAN OUTPUT (what the LLM returns, stored in session.plan)
// =============================================================================

export const WellnessLLMPlanOutputSchema = z.object({
  interpretation: WellnessInterpretationSchema,
  book: WellnessBookPlanSchema,
  album: WellnessAlbumPlanSchema,
  firstTrack: WellnessFirstTrackPlanSchema,
});
export type WellnessLLMPlanOutput = z.infer<typeof WellnessLLMPlanOutputSchema>;
