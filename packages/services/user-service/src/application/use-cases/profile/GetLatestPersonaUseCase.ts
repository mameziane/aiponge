/**
 * Get Latest Persona Use Case
 * Retrieves the most recent persisted persona for a user
 */

import type { IPersonaRepository, PersistedPersona } from '@infrastructure/repositories';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '@application/errors';

const logger = getLogger('get-latest-persona-use-case');

export interface GetLatestPersonaRequest {
  userId: string;
}

export interface GetLatestPersonaResponse {
  success: boolean;
  persona: PersistedPersona | null;
  generatedAt: string | null;
}

export class GetLatestPersonaUseCase {
  constructor(private readonly personaRepository: IPersonaRepository) {}

  async execute(request: GetLatestPersonaRequest): Promise<GetLatestPersonaResponse> {
    try {
      logger.info('Fetching latest persona for user: {}', { data0: request.userId });

      if (!request.userId?.trim()) {
        throw ProfileError.userIdRequired();
      }

      const persona = await this.personaRepository.getLatestPersona(request.userId);

      if (!persona) {
        logger.info('No persona found for user: {}', { data0: request.userId });
        return {
          success: true,
          persona: null,
          generatedAt: null,
        };
      }

      logger.info('Retrieved persona {} for user: {}', { data0: persona.id, data1: request.userId });

      return {
        success: true,
        persona,
        generatedAt: persona.generatedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      logger.error('Failed to get latest persona: {}', { data0: error });
      throw ProfileError.internalError('Failed to get latest persona', error instanceof Error ? error : undefined);
    }
  }
}
