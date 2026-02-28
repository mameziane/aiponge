/**
 * Create Reflection Use Case
 * Handles reflection creation with profile metric updates
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { IProfileRepository } from '@domains/profile';
import { Reflection, NewReflection } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';

const logger = getLogger('create-reflection-use-case');

export class CreateReflectionUseCase {
  constructor(
    private intelligenceRepo: IIntelligenceRepository,
    private profileRepo: IProfileRepository
  ) {}

  async execute(data: NewReflection): Promise<Reflection> {
    // Create reflection
    const reflection = await this.intelligenceRepo.createReflection(data);

    // Update profile metrics - CRITICAL: This was missing!
    try {
      await this.profileRepo.incrementReflections(data.userId as string);
      logger.info('Reflection created and profile updated', {
        reflectionId: reflection.id,
        userId: data.userId,
      });
    } catch (error) {
      logger.error('Failed to update profile metrics after reflection creation', { error });
      // Don't fail the whole operation, but log it
    }

    return reflection;
  }
}
