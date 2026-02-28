/**
 * Archive Entry Use Case
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { Entry } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';
import { LibraryError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('archive-entry-use-case');

export interface ArchiveEntryRequest {
  entryId: string;
  userId: string;
  archive: boolean;
  reason?: string;
  cascadeArchive?: boolean;
}

export interface ArchiveEntryResponse {
  entry: Entry;
  operation: 'archived' | 'unarchived';
  impact: {
    insightsAffected: number;
    analyticsRecorded: boolean;
  };
  timestamp: string;
}

export class ArchiveEntryUseCase {
  constructor(private intelligenceRepository: IIntelligenceRepository) {}

  async execute(request: ArchiveEntryRequest): Promise<ArchiveEntryResponse> {
    try {
      this.validateRequest(request);

      const existingEntry = await this.intelligenceRepository.findEntryById(request.entryId);

      if (!existingEntry) {
        throw LibraryError.entryNotFound(request.entryId);
      }

      if (existingEntry.userId !== request.userId) {
        throw LibraryError.ownershipRequired('entry');
      }

      const currentMetadata = (existingEntry.metadata as Record<string, unknown>) || {};
      const updatedEntry = await this.intelligenceRepository.updateEntry(request.entryId, {
        metadata: {
          ...currentMetadata,
          isArchived: request.archive,
          archiveReason: request.reason,
          archivedAt: request.archive ? new Date().toISOString() : null,
        },
      });

      logger.info('Entry archive status updated', { entryId: request.entryId, archived: request.archive });

      return {
        entry: updatedEntry,
        operation: request.archive ? 'archived' : 'unarchived',
        impact: {
          insightsAffected: 0,
          analyticsRecorded: true,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to archive entry', { error: serializeError(error) });
      throw error;
    }
  }

  private validateRequest(request: ArchiveEntryRequest): void {
    if (!request.entryId?.trim()) {
      throw LibraryError.validationError('entryId', 'Entry ID is required');
    }

    if (!request.userId?.trim()) {
      throw LibraryError.userIdRequired();
    }
  }
}
