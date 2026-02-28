/**
 * Frontend Validation Utilities
 *
 * Uses schemas from @aiponge/shared-contracts for consistent
 * validation between frontend and backend.
 */

import { z } from 'zod';
import {
  CreateEntrySchema,
  UpdateEntrySchema,
  CreateReflectionSchema,
  UpdateReflectionSchema,
  CreateChapterSchema,
  UpdateChapterSchema,
  GenerateLyricsSchema,
  type CreateEntryInput,
  type UpdateEntryInput,
  type CreateReflectionInput,
  type UpdateReflectionInput,
  type CreateChapterInput,
  type UpdateChapterInput,
  type GenerateLyricsInput,
} from '@aiponge/shared-contracts';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Array<{ field: string; message: string }> };

function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    })),
  };
}

export function validateCreateEntry(data: unknown) {
  return validate(CreateEntrySchema, data);
}

export function validateUpdateEntry(data: unknown): ValidationResult<UpdateEntryInput> {
  return validate(UpdateEntrySchema, data);
}

export function validateCreateReflection(data: unknown): ValidationResult<CreateReflectionInput> {
  return validate(CreateReflectionSchema, data);
}

export function validateUpdateReflection(data: unknown): ValidationResult<UpdateReflectionInput> {
  return validate(UpdateReflectionSchema, data);
}

export function validateCreateChapter(data: unknown): ValidationResult<CreateChapterInput> {
  return validate(CreateChapterSchema, data);
}

export function validateUpdateChapter(data: unknown): ValidationResult<UpdateChapterInput> {
  return validate(UpdateChapterSchema, data);
}

export function validateGenerateLyrics(data: unknown): ValidationResult<GenerateLyricsInput> {
  return validate(GenerateLyricsSchema, data);
}

export {
  CreateEntrySchema,
  UpdateEntrySchema,
  CreateReflectionSchema,
  UpdateReflectionSchema,
  CreateChapterSchema,
  UpdateChapterSchema,
  GenerateLyricsSchema,
  type CreateEntryInput,
  type UpdateEntryInput,
  type CreateReflectionInput,
  type UpdateReflectionInput,
  type CreateChapterInput,
  type UpdateChapterInput,
  type GenerateLyricsInput,
};
