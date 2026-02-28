import { IIntelligenceRepository } from '@domains/intelligence';
import { MoodCheckin } from '@domains/insights/types';
import { getLogger } from '@config/service-urls';

const logger = getLogger('record-mood-checkin');

const MOOD_MICRO_QUESTIONS: Record<string, string[]> = {
  happy: [
    'What contributed most to this feeling?',
    'Who were you with when you felt this way?',
    'How can you create more moments like this?',
  ],
  sad: [
    'What triggered this feeling?',
    'Is there something you need right now?',
    'What has helped you through similar moments before?',
  ],
  anxious: [
    'What specifically feels uncertain right now?',
    'What is one thing within your control right now?',
    'What would you tell a friend feeling this way?',
  ],
  calm: [
    'What helped you reach this state of calm?',
    'How does your body feel right now?',
    'What practice brought you to this place?',
  ],
  frustrated: [
    "What expectation wasn't met?",
    'What outcome would feel satisfying?',
    'Is there a smaller step you could take right now?',
  ],
  grateful: [
    'What are you most grateful for right now?',
    'How has this gratitude changed your perspective today?',
    'Who would you like to share this feeling with?',
  ],
  neutral: [
    "Is there something beneath the surface you haven't noticed?",
    'What would make this moment feel more meaningful?',
    'What were you doing just before checking in?',
  ],
};

const DEFAULT_QUESTIONS = [
  "What's on your mind right now?",
  'How has your day been so far?',
  "Is there anything you'd like to explore about this feeling?",
];

export interface RecordMoodCheckInInput {
  userId: string;
  mood: string;
  emotionalIntensity: number;
  content?: string;
  triggerTag?: string;
}

export interface MoodCheckInResult {
  checkin: MoodCheckin;
  microQuestion: string;
  patternConnection: {
    connected: boolean;
    patternId?: string;
    patternName?: string;
    message?: string;
  };
}

export class RecordMoodCheckInUseCase {
  constructor(private intelligenceRepo: IIntelligenceRepository) {}

  async execute(input: RecordMoodCheckInInput): Promise<MoodCheckInResult> {
    const { userId, mood, emotionalIntensity, content, triggerTag } = input;

    const intensity = Math.max(1, Math.min(10, emotionalIntensity));

    const microQuestion = this.selectMicroQuestion(mood, intensity);

    const recentCheckins = await this.intelligenceRepo.findRecentMoodCheckins(userId, 7);

    let patternConnection: MoodCheckInResult['patternConnection'] = { connected: false };
    const patterns = await this.intelligenceRepo.getUserPatterns(userId, { limit: 10 });
    const matchingPattern = patterns.find(
      p =>
        p.patternName.toLowerCase().includes(mood.toLowerCase()) ||
        (p.relatedThemes && p.relatedThemes.some(t => t.toLowerCase().includes(mood.toLowerCase())))
    );

    if (matchingPattern) {
      patternConnection = {
        connected: true,
        patternId: matchingPattern.id,
        patternName: matchingPattern.patternName,
        message: `This mood connects to your "${matchingPattern.patternName}" pattern.`,
      };
    }

    const sameRecentMoodCount = recentCheckins.filter(c => c.mood === mood).length;
    if (!matchingPattern && sameRecentMoodCount >= 3) {
      patternConnection = {
        connected: false,
        message: `You've logged "${mood}" ${sameRecentMoodCount} times this week. This could be an emerging pattern worth exploring.`,
      };
    }

    const checkin = await this.intelligenceRepo.createMoodCheckin({
      userId,
      mood,
      emotionalIntensity: intensity,
      content: content || null,
      triggerTag: triggerTag || null,
      microQuestion,
      patternConnectionId: matchingPattern?.id || null,
    });

    logger.info('Mood check-in recorded', {
      checkinId: checkin.id,
      userId,
      mood,
      intensity,
      hasPatternConnection: patternConnection.connected,
    });

    return { checkin, microQuestion, patternConnection };
  }

  private selectMicroQuestion(mood: string, intensity: number): string {
    const questions = MOOD_MICRO_QUESTIONS[mood.toLowerCase()] || DEFAULT_QUESTIONS;
    const index = intensity <= 3 ? 0 : intensity <= 6 ? 1 : 2;
    return questions[Math.min(index, questions.length - 1)];
  }
}
