/**
 * Validation Middleware
 * Request validation using Zod schemas for the AI Music Service
 */

import { z } from 'zod';
import { ContentVisibilitySchema, ContentVisibilityWithDefaultSchema } from '@aiponge/shared-contracts';
import { getValidation } from '@aiponge/platform-core';

const { validateBody: sharedValidateBody, validateQuery: sharedValidateQuery, validateParams: sharedValidateParams } = getValidation();

export const validationSchemas = {
  'generate-music': z.object({
    userId: z.string().uuid(),
    entryId: z.string().uuid().optional(),
    lyricsId: z.string().uuid().optional(),
    musicType: z.enum(['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop']),
    prompt: z.string().min(1).max(5000),
    style: z.string().optional(),
    genre: z.string().optional(),
    mood: z.string().optional(),
    tempo: z.number().min(60).max(200).optional(),
    key: z.string().optional(),
    duration: z.number().min(5).max(600).optional(),
    culturalStyle: z.string().optional(),
    instrumentType: z.string().optional(),
    wellbeingPurpose: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    parameters: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    templateId: z.string().uuid().optional(),
    useRecommendedTemplate: z.boolean().optional(),
  }),

  'process-audio': z.object({
    audioUrl: z.string().url(),
    processingType: z.enum(['normalize', 'convert', 'master', 'effects', 'enhance']),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    outputFormat: z.string().optional(),
    bitrate: z.number().optional(),
    sampleRate: z.number().optional(),
    channels: z.enum(['mono', 'stereo']).optional(),
    effects: z
      .array(
        z.object({
          type: z.string(),
          parameters: z.record(z.unknown()).optional(),
        })
      )
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  }),

  'create-template': z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    category: z.string(),
    musicType: z.enum(['song', 'instrumental', 'jingle', 'background', 'soundtrack', 'loop']),
    style: z.string().optional(),
    genre: z.string().optional(),
    mood: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
    visibility: ContentVisibilityWithDefaultSchema,
    tags: z.array(z.string()).optional(),
  }),

  'track-event': z.object({
    eventType: z.enum(['play', 'download', 'like', 'share', 'skip', 'favorite']),
    musicResultId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    sessionId: z.string().optional(),
    deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
    location: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),

  'update-result': z.object({
    title: z.string().optional(),
    displayName: z.string().optional(),
    album: z.string().optional(),
    visibility: ContentVisibilitySchema.optional(),
    tags: z.array(z.string()).optional(),
  }),

  'update-template': z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    template: z.string().min(1).optional(),
    promptTemplate: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    visibility: ContentVisibilitySchema.optional(),
  }),

  'create-playlist': z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    musicIds: z.array(z.string().uuid()).optional(),
    visibility: ContentVisibilityWithDefaultSchema,
    tags: z.array(z.string()).optional(),
  }),

  'update-playlist': z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    musicIds: z.array(z.string().uuid()).optional(),
    visibility: ContentVisibilitySchema.optional(),
    tags: z.array(z.string()).optional(),
  }),

  'record-event': z.object({
    eventType: z.enum([
      'play',
      'download',
      'like',
      'share',
      'skip',
      'favorite',
      'library_access',
      'library_item_update',
      'library_item_delete',
      'library_search',
    ]),
    musicResultId: z.string().uuid().optional(),
    eventData: z.record(z.unknown()).optional(),
    sessionId: z.string().optional(),
    deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional(),
  }),
};

export type ValidationSchemaKey = keyof typeof validationSchemas;

export function validationMiddleware(schemaKey: ValidationSchemaKey) {
  const schema = validationSchemas[schemaKey] as z.ZodSchema;
  return sharedValidateBody(schema);
}

export function queryValidationMiddleware(schema: z.ZodSchema) {
  return sharedValidateQuery(schema);
}

export function paramValidationMiddleware(schema: z.ZodSchema) {
  return sharedValidateParams(schema);
}
