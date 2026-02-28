import { IIntelligenceRepository } from '@domains/intelligence';
import { PatternReaction } from '@domains/insights/types';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '../../errors/errors';

const logger = getLogger('explore-pattern-use-case');

type ReactionType = 'resonates' | 'partially' | 'not_me' | 'curious';

export interface ExplorePatternInput {
  patternId: string;
  userId: string;
  reaction: ReactionType;
  explanation?: string;
}

export interface ExplorePatternResult {
  reaction: PatternReaction;
  followUpAction: {
    type: 'reflection_prompt' | 'insight_generated' | 'pattern_refined' | 'exploration_prompt';
    message: string;
    data?: Record<string, unknown>;
  };
}

const REACTION_RESPONSES: Record<ReactionType, { type: string; messageTemplate: string }> = {
  resonates: { type: 'insight_generated', messageTemplate: 'Your recognition of this pattern is a powerful step. This pattern of "{patternName}" shows real self-awareness.' },
  partially: { type: 'exploration_prompt', messageTemplate: 'Interesting - you see some truth in "{patternName}" but not completely. What parts feel accurate, and what feels different?' },
  not_me: { type: 'pattern_refined', messageTemplate: 'Thank you for the honest feedback on "{patternName}". Your perspective helps refine how we understand your patterns.' },
  curious: { type: 'reflection_prompt', messageTemplate: 'Curiosity about "{patternName}" is a great starting point. Let\'s explore what this pattern might mean for you.' },
};

export class ExplorePatternUseCase {
  constructor(private intelligenceRepo: IIntelligenceRepository) {}

  async execute(input: ExplorePatternInput): Promise<ExplorePatternResult> {
    const { patternId, userId, reaction: reactionType, explanation } = input;

    const pattern = await this.intelligenceRepo.getPatternById(patternId, userId);
    if (!pattern) {
      throw ProfileError.notFound('Pattern', patternId);
    }

    const validReactions: ReactionType[] = ['resonates', 'partially', 'not_me', 'curious'];
    if (!validReactions.includes(reactionType)) {
      throw ProfileError.validationError('reaction', `Invalid reaction type: ${reactionType}. Must be one of: ${validReactions.join(', ')}`);
    }

    const reaction = await this.intelligenceRepo.createPatternReaction({
      userId,
      patternId,
      reaction: reactionType,
      explanation: explanation || null,
    });

    const responseConfig = REACTION_RESPONSES[reactionType];
    const message = responseConfig.messageTemplate.replace('{patternName}', pattern.patternName);

    if (reactionType === 'not_me') {
      const currentStrength = pattern.strength || 'moderate';
      const strengthLevels = ['weak', 'moderate', 'strong', 'very_strong'];
      const currentIndex = strengthLevels.indexOf(currentStrength);
      const newStrength = currentIndex > 0 ? strengthLevels[currentIndex - 1] : 'weak';
      await this.intelligenceRepo.updatePattern(patternId, { strength: newStrength });
    }

    if (reactionType === 'curious' || reactionType === 'partially') {
      const explorationPrompt = reactionType === 'curious'
        ? `Take a moment to reflect: When do you notice "${pattern.patternName}" showing up in your daily life?`
        : `You partially identify with "${pattern.patternName}". What aspects feel true, and what doesn't quite fit?`;
      await this.intelligenceRepo.updatePattern(patternId, { explorationPrompt });
    }

    logger.info('Pattern exploration completed', {
      patternId,
      userId,
      reaction: reactionType,
      followUpType: responseConfig.type,
    });

    return {
      reaction,
      followUpAction: {
        type: responseConfig.type as 'reflection_prompt' | 'insight_generated' | 'pattern_refined' | 'exploration_prompt',
        message,
      },
    };
  }
}
