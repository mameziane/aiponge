/**
 * Create Insight Use Case
 * Handles insight creation with profile metric updates
 */

import { IIntelligenceRepository } from '@domains/intelligence';
import { IProfileRepository } from '@domains/profile';
import { Insight, NewInsight } from '@infrastructure/database/schemas/profile-schema';
import { getLogger } from '@config/service-urls';

const logger = getLogger('create-insight-use-case');

export class CreateInsightUseCase {
  constructor(
    private intelligenceRepo: IIntelligenceRepository,
    private profileRepo: IProfileRepository
  ) {}

  async execute(data: NewInsight): Promise<Insight> {
    // Create insight
    const insight = await this.intelligenceRepo.createInsight(data);

    // Update profile metrics - CRITICAL: This was missing!
    try {
      await this.profileRepo.incrementInsights(data.userId as string);
      logger.info('Insight created and profile updated', {
        insightId: insight.id,
        userId: data.userId,
      });
    } catch (error) {
      logger.error('Failed to update profile metrics after insight creation', { error });
      // Don't fail the whole operation, but log it
    }

    return insight;
  }
}
