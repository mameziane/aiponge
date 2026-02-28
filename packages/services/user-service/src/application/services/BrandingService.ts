/**
 * Branding Resolution Service
 * Resolves the effective branding for a user based on:
 * 1. Their organization's branding (from usr_organizations)
 * 2. Their subscription tier branding rules (Studio=custom, Practice=aiponge+org)
 * 3. Default Aiponge branding fallback
 *
 * Used by content sharing and music generation pipelines to determine
 * what branding to apply to shared content.
 */

import { getDatabase } from '../../infrastructure/database/DatabaseConnectionFactory';
import { users } from '../../infrastructure/database/schemas/user-schema';
import { usrOrganizations } from '../../infrastructure/database/schemas/organization-schema';
import { usrSubscriptions } from '../../infrastructure/database/schemas/subscription-schema';
import { eq, and, isNull } from 'drizzle-orm';
import { resolveEffectiveBranding, AIPONGE_BRANDING, TIER_IDS, type Branding } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('branding-service');

export interface ResolvedBranding {
  branding: Branding;
  organizationId: string | null;
  organizationName: string | null;
  tier: string;
  brandingMode: 'custom' | 'aiponge' | 'default';
}

export class BrandingService {
  /**
   * Resolve effective branding for a user.
   *
   * Resolution order:
   * 1. Look up user's organizationId from usr_accounts
   * 2. If org exists, fetch branding from usr_organizations
   * 3. Look up user's subscription tier to determine songBranding
   * 4. Apply resolveEffectiveBranding() from shared contracts
   */
  async resolveForUser(userId: string): Promise<ResolvedBranding> {
    const db = getDatabase();

    try {
      // Fetch user with their organizationId
      const [user] = await db
        .select({
          id: users.id,
          organizationId: users.organizationId,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)));

      if (!user) {
        logger.warn('User not found for branding resolution', { userId });
        return {
          branding: AIPONGE_BRANDING,
          organizationId: null,
          organizationName: null,
          tier: TIER_IDS.GUEST,
          brandingMode: 'default',
        };
      }

      // Fetch subscription tier
      const [subscription] = await db
        .select({
          subscriptionTier: usrSubscriptions.subscriptionTier,
        })
        .from(usrSubscriptions)
        .where(and(eq(usrSubscriptions.userId, userId), isNull(usrSubscriptions.deletedAt)));

      const tier = subscription?.subscriptionTier || TIER_IDS.GUEST;

      // Determine songBranding from tier
      let songBranding: 'custom' | 'aiponge' | null = null;
      if (tier === TIER_IDS.STUDIO) {
        songBranding = 'custom';
      } else if (tier === TIER_IDS.PRACTICE) {
        songBranding = 'aiponge';
      }

      // Fetch organization branding if user belongs to one
      let orgBranding: Branding | null = null;
      let organizationId: string | null = null;
      let organizationName: string | null = null;

      if (user.organizationId) {
        const [org] = await db
          .select({
            id: usrOrganizations.id,
            name: usrOrganizations.name,
            branding: usrOrganizations.branding,
          })
          .from(usrOrganizations)
          .where(and(eq(usrOrganizations.id, user.organizationId), isNull(usrOrganizations.deletedAt)));

        if (org) {
          organizationId = org.id;
          organizationName = org.name;
          orgBranding = (org.branding || {}) as Branding;
        }
      }

      const branding = resolveEffectiveBranding(orgBranding, songBranding);

      return {
        branding,
        organizationId,
        organizationName,
        tier,
        brandingMode: songBranding || 'default',
      };
    } catch (error) {
      logger.error('Failed to resolve branding for user', { userId, error });
      return {
        branding: AIPONGE_BRANDING,
        organizationId: null,
        organizationName: null,
        tier: TIER_IDS.GUEST,
        brandingMode: 'default',
      };
    }
  }
}
