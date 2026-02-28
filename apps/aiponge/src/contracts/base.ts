import { z } from 'zod';
import { ServiceResponseSchema, ServiceErrorSchema } from '@aiponge/shared-contracts';

export { ServiceResponseSchema as ApiResponseSchema };

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: itemSchema.array(),
    total: z.number(),
    hasMore: z.boolean().optional(),
  });

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ServiceErrorSchema.optional(),
});

export const UUIDSchema = z.string().uuid();
export const DateStringSchema = z.string().datetime().or(z.string());
export const NullableStringSchema = z.string().nullable().optional();
