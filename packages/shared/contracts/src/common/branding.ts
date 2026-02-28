/**
 * Organization Branding Contracts
 * Shared types for organization branding across all services.
 *
 * Used by Practice/Studio tier organizations for white-label features.
 * The branding object is designed to be future-proof — only organizationName
 * and displayName are used initially; other fields are anticipated for
 * future iterations (logo, colors, tagline, custom domain).
 *
 * Branding resolution order:
 * 1. User's organization branding (from usr_organizations)
 * 2. Tier-based rules (Studio = full custom, Practice = org + Aiponge)
 * 3. Default Aiponge branding fallback
 */

import { z } from 'zod';

export const BrandingSchema = z.object({
  organizationName: z.string().max(150).optional(),
  displayName: z.string().max(100).optional(),
  logoUrl: z.string().url().max(500).optional(),
  tagline: z.string().max(250).optional(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
});

export type Branding = z.infer<typeof BrandingSchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(255),
  slug: z.string().max(100).optional().nullable(),
  branding: BrandingSchema.default({}),
  ownerUserId: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'archived']),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type OrganizationDTO = z.infer<typeof OrganizationSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(100).optional(),
  branding: BrandingSchema.optional(),
});

export type CreateOrganizationDTO = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().max(100).optional(),
  branding: BrandingSchema.partial().optional(),
});

export type UpdateOrganizationDTO = z.infer<typeof UpdateOrganizationSchema>;

export const DEFAULT_BRANDING: Branding = {};

export const AIPONGE_BRANDING: Branding = {
  organizationName: 'Aiponge',
  displayName: 'Aiponge',
};

/**
 * Resolve effective branding based on org branding and tier.
 * - Studio: full custom branding from org
 * - Practice: org name shown alongside Aiponge branding
 * - Other tiers: default Aiponge branding
 */
export function resolveEffectiveBranding(
  orgBranding: Branding | null | undefined,
  songBranding: 'aiponge' | 'custom' | null | undefined
): Branding {
  if (!orgBranding) {
    return AIPONGE_BRANDING;
  }

  if (songBranding === 'custom') {
    return {
      ...AIPONGE_BRANDING,
      ...orgBranding,
    };
  }

  if (songBranding === 'aiponge') {
    return {
      ...AIPONGE_BRANDING,
      organizationName: orgBranding.organizationName || AIPONGE_BRANDING.organizationName,
    };
  }

  return AIPONGE_BRANDING;
}
