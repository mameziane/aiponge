import { IIntelligenceRepository } from '@domains/intelligence';
import { ReflectionTurn } from '@domains/insights/types';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '../../errors/errors';
import { truncateAtSentence } from '../../utils/text';

const logger = getLogger('continue-reflection-dialogue');

const FOLLOW_UP_TEMPLATES = [
  'What feelings come up when you think about that?',
  'How does this connect to other areas of your life?',
  'What would you like to change about this situation?',
  'If you could give advice to someone in the same position, what would you say?',
  'What strengths have you used in similar situations before?',
];

const THERAPEUTIC_FRAMEWORKS = [
  'cognitive-behavioral',
  'acceptance-commitment',
  'strengths-based',
  'narrative-therapy',
  'mindfulness-based',
];

export interface ContinueDialogueInput {
  reflectionId: string;
  userId: string;
  userResponse: string;
}

export interface DialogueResult {
  reflection: { id: string; challengeQuestion: string; isBreakthrough: boolean | null };
  turns: ReflectionTurn[];
  latestTurn: ReflectionTurn;
  nextQuestion: ReflectionTurn | null;
  isBreakthrough: boolean;
  synthesis: string | null;
  savedInsightId: string | null;
}

export class ContinueReflectionDialogueUseCase {
  constructor(private intelligenceRepo: IIntelligenceRepository) {}

  async execute(input: ContinueDialogueInput): Promise<DialogueResult> {
    const { reflectionId, userId, userResponse } = input;

    const reflection = await this.intelligenceRepo.findReflectionById(reflectionId, userId);
    if (!reflection) {
      throw ProfileError.notFound('Reflection', reflectionId);
    }

    const turns = await this.intelligenceRepo.findReflectionTurnsByReflectionId(reflectionId);
    const currentTurnNumber = await this.intelligenceRepo.getMaxTurnNumber(reflectionId);

    const unansweredTurn = turns.find(t => !t.response);

    let answeredTurn: ReflectionTurn;
    if (unansweredTurn) {
      const microInsight = this.generateMicroInsight(userResponse, unansweredTurn.question);
      answeredTurn = await this.intelligenceRepo.updateReflectionTurn(unansweredTurn.id, {
        response: userResponse,
        microInsight,
        respondedAt: new Date(),
      });
    } else {
      const microInsight = this.generateMicroInsight(userResponse, reflection.challengeQuestion);
      answeredTurn = await this.intelligenceRepo.createReflectionTurn({
        reflectionId,
        turnNumber: currentTurnNumber + 1,
        question: reflection.challengeQuestion,
        response: userResponse,
        microInsight,
        therapeuticFramework: THERAPEUTIC_FRAMEWORKS[0],
        respondedAt: new Date(),
      });
    }

    const allTurns = [...turns.filter(t => t.id !== answeredTurn.id), answeredTurn];
    const isBreakthrough = allTurns.length >= 3 && this.detectBreakthrough(userResponse, allTurns);

    let savedInsightId: string | null = null;

    if (isBreakthrough && !reflection.isBreakthrough) {
      await this.intelligenceRepo.updateReflection(reflectionId, { isBreakthrough: true });

      const insightTitle = truncateAtSentence(userResponse, 120);
      const firstSentenceEnd = Math.max(
        insightTitle.indexOf('.'),
        insightTitle.indexOf('!'),
        insightTitle.indexOf('?')
      );
      const title =
        firstSentenceEnd > 0 ? insightTitle.slice(0, firstSentenceEnd + 1) : truncateAtSentence(userResponse, 60);

      const insight = await this.intelligenceRepo.createInsight({
        userId,
        type: 'self_discovered',
        title,
        content: userResponse,
        category: 'breakthrough',
        confidence: 'high',
        actionable: false,
        generatedAt: new Date(),
        metadata: {
          reflectionId,
          turnNumber: answeredTurn.turnNumber,
          source: 'reflection_dialogue',
        },
      });
      savedInsightId = insight.id;

      logger.info('Breakthrough insight created', {
        insightId: insight.id,
        reflectionId,
        userId,
      });
    }

    let synthesis: string | null = null;
    if (allTurns.length >= 5 || isBreakthrough) {
      synthesis = this.generateSynthesis(allTurns);
    }

    let nextQuestion: ReflectionTurn | null = null;
    const nextTurnNumber = (answeredTurn.turnNumber || currentTurnNumber) + 1;
    if (nextTurnNumber <= 7 && !isBreakthrough) {
      const frameworkIndex = nextTurnNumber % THERAPEUTIC_FRAMEWORKS.length;
      const questionIndex = nextTurnNumber % FOLLOW_UP_TEMPLATES.length;
      nextQuestion = await this.intelligenceRepo.createReflectionTurn({
        reflectionId,
        turnNumber: nextTurnNumber,
        question: FOLLOW_UP_TEMPLATES[questionIndex],
        therapeuticFramework: THERAPEUTIC_FRAMEWORKS[frameworkIndex],
      });
    }

    const finalTurns = await this.intelligenceRepo.findReflectionTurnsByReflectionId(reflectionId);

    logger.info('Reflection dialogue continued', {
      reflectionId,
      turnNumber: answeredTurn.turnNumber,
      isBreakthrough,
      hasSynthesis: !!synthesis,
      savedInsightId,
    });

    return {
      reflection: {
        id: reflection.id,
        challengeQuestion: reflection.challengeQuestion,
        isBreakthrough: isBreakthrough || reflection.isBreakthrough,
      },
      turns: finalTurns,
      latestTurn: answeredTurn,
      nextQuestion,
      isBreakthrough,
      synthesis,
      savedInsightId,
    };
  }

  private generateMicroInsight(response: string, question: string): string {
    const wordCount = response.split(/\s+/).length;
    if (wordCount > 50) return 'You explored this topic in depth - that level of reflection shows real self-awareness.';
    if (response.includes('feel') || response.includes('emotion'))
      return 'You connected with your emotions here - that takes courage.';
    if (response.includes('realize') || response.includes('understand'))
      return 'A moment of clarity - these realizations are the building blocks of growth.';
    return 'Each reflection brings you closer to understanding yourself better.';
  }

  private detectBreakthrough(latestResponse: string, allTurns: ReflectionTurn[]): boolean {
    const breakthroughIndicators = [
      'realize',
      'understand now',
      'never thought',
      'makes sense',
      'see the pattern',
      'connection',
      'aha',
      'finally',
    ];
    const lower = latestResponse.toLowerCase();
    const hasIndicator = breakthroughIndicators.some(indicator => lower.includes(indicator));
    const hasDepth = latestResponse.split(/\s+/).length > 30;
    return hasIndicator && hasDepth;
  }

  private generateSynthesis(turns: ReflectionTurn[]): string {
    const answeredTurns = turns.filter(t => t.response);
    const themes = answeredTurns.map(t => t.microInsight).filter(Boolean);
    return `Through ${answeredTurns.length} exchanges, you've explored different facets of this topic. ${themes.length > 0 ? `Key themes: ${themes.slice(0, 3).join('. ')}` : ''}`;
  }
}
