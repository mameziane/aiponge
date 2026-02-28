/**
 * Profile Name Update Helper
 * Centralizes displayName sync logic to ensure consistency
 * across all profile update paths (ProfileController, UpdateUserProfileUseCase, UpdateUserUseCase)
 * Updates track metadata.displayName field in music-service when display name changes
 */

import { getLogger, getServiceUrl, createServiceHttpClient } from '../../config/service-urls';
import { signUserIdHeader, serializeError } from '@aiponge/platform-core';

const httpClient = createServiceHttpClient('internal');

const logger = getLogger('profile-name-update-helper');

export interface DisplayNameUpdateParams {
  userId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  currentDisplayName?: string;
  currentFirstName?: string;
  currentLastName?: string;
}

export interface DisplayNameUpdateResult {
  newDisplayName: string;
  displayNameChanged: boolean;
}

export class ProfileNameUpdateHelper {
  /**
   * Calculate the new displayName based on provided fields
   * Priority:
   * 1. Explicit displayName if provided
   * 2. Merged firstName+lastName (using current values for missing fields)
   * 3. Current displayName as fallback
   *
   * For partial updates (only firstName OR only lastName), merges with existing values
   */
  static calculateDisplayName(params: DisplayNameUpdateParams): DisplayNameUpdateResult {
    const { firstName, lastName, displayName, currentDisplayName, currentFirstName, currentLastName } = params;

    let newDisplayName: string;

    if (displayName) {
      newDisplayName = displayName.trim();
    } else if (firstName || lastName) {
      const effectiveFirstName = firstName ?? currentFirstName ?? '';
      const effectiveLastName = lastName ?? currentLastName ?? '';
      newDisplayName = `${effectiveFirstName} ${effectiveLastName}`.trim();
    } else {
      newDisplayName = currentDisplayName || '';
    }

    const displayNameChanged = newDisplayName !== currentDisplayName && newDisplayName.length > 0;

    return {
      newDisplayName,
      displayNameChanged,
    };
  }

  /**
   * Update displayName and sync to music service if changed
   * This is the single source of truth for displayName updates
   *
   * @param params - The update parameters
   * @returns The new displayName and whether it changed
   */
  static async updateAndSync(params: DisplayNameUpdateParams): Promise<DisplayNameUpdateResult> {
    const result = this.calculateDisplayName(params);

    if (result.displayNameChanged) {
      logger.info('Display name changed, syncing to music service', {
        userId: params.userId,
        oldDisplayName: params.currentDisplayName,
        newDisplayName: result.newDisplayName,
      });

      try {
        const musicServiceUrl = getServiceUrl('music-service');
        const fullUrl = `${musicServiceUrl}/api/library/tracks/bulk-update-creator-name`;
        const authHeaders = signUserIdHeader(params.userId);

        const response = await httpClient.patchWithResponse<{ data?: { updatedCount?: number } }>(
          fullUrl,
          { displayName: result.newDisplayName },
          { headers: { ...authHeaders }, timeout: 30000 }
        );

        if (response.ok) {
          logger.info('Creator name synced to music library', {
            userId: params.userId,
            displayName: result.newDisplayName,
            updatedCount: response.data.data?.updatedCount,
          });
        } else {
          logger.warn('Creator name sync failed', {
            userId: params.userId,
            status: response.status,
          });
        }
      } catch (error) {
        logger.error('Failed to sync creator name', {
          userId: params.userId,
          error: serializeError(error),
        });
      }
    }

    return result;
  }
}
