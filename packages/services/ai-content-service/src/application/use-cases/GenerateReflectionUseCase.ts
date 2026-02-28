/**
 * Generate Reflection Use Case - Core business logic for reflection generation
 * Handles generating follow-up questions, deeper challenges, and insights
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentAIService } from '../../domains/services/ContentAIService';
import { TemplateEngineServiceClient } from '../../infrastructure/clients/TemplateEngineServiceClient';
import {
  frameworkSelectionService,
  type FrameworkSelectionResult,
} from '../../domains/services/FrameworkSelectionService';
import { getLogger } from '../../config/service-urls';
import { contentServiceConfig } from '../../config/service-config';
import { ContentError, TemplateError } from '../errors';

const logger = getLogger('ai-content-service-generatereflectionusecase');

interface AnalyticsService {
  recordEvent(event: {
    eventType: string;
    eventData: Record<string, unknown>;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface GenerateReflectionUseCaseRequest {
  originalQuestion: string;
  userResponse: string;
  reflectionType: 'follow-up-questions' | 'deeper-challenges' | 'insights';
  depth: 'basic' | 'comprehensive' | 'advanced';
  context: {
    userHistory?: Array<{
      question: string;
      response: string;
      timestamp: string;
    }>;
  };
}

export interface GenerateReflectionUseCaseResult {
  success: boolean;
  requestId: string;
  reflections: {
    questions?: string[];
    challenges?: string[];
    insights?: string[];
    framework?: string;
    therapeuticFramework?: {
      primary?: {
        id: string;
        name: string;
        shortName: string;
        keyPrinciples: string[];
        therapeuticGoals: string[];
      };
      detectedEmotions: string[];
      detectedThemes: string[];
      therapeuticApproach: string;
    };
  };
  metadata: {
    processingTimeMs: number;
    confidenceLevel: number;
    recommendedNextSteps: string[];
  };
  error?: string;
}

export class GenerateReflectionUseCase {
  private readonly templateClient: TemplateEngineServiceClient;

  constructor(
    private readonly contentAIService: ContentAIService,
    private readonly _analyticsService?: AnalyticsService
  ) {
    this.templateClient = new TemplateEngineServiceClient();
    logger.debug('🤔 Initialized with reflection generation pipeline and template engine');
  }

  private get analyticsService(): AnalyticsService | undefined {
    return this._analyticsService;
  }

  async execute(request: GenerateReflectionUseCaseRequest): Promise<GenerateReflectionUseCaseResult> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Record analytics
      await this.recordAnalyticsSafely({
        eventType: 'reflection_generation_request_started',
        eventData: {
          requestId,
          reflectionType: request.reflectionType,
          depth: request.depth,
          questionLength: request.originalQuestion.length,
          responseLength: request.userResponse.length,
          historyCount: request.context.userHistory?.length || 0,
        },
      });

      // Step 1: Validate request
      this.validateRequest(request);

      // Step 2: Generate reflections based on type and depth
      const reflections = await this.generateReflections(request);

      // Step 3: Generate recommended next steps
      const recommendedNextSteps = await this.generateNextSteps(request, reflections);

      // Step 4: Calculate confidence level
      const confidenceLevel = this.calculateConfidenceLevel(request, reflections);

      // Step 5: Record success analytics
      const processingTime = Date.now() - startTime;
      await this.recordAnalyticsSafely({
        eventType: 'reflection_generation_completed',
        eventData: {
          requestId,
          success: true,
          reflectionType: request.reflectionType,
          depth: request.depth,
          processingTime,
          questionsGenerated: reflections.questions?.length || 0,
          challengesGenerated: reflections.challenges?.length || 0,
          insightsGenerated: reflections.insights?.length || 0,
          confidenceLevel,
        },
      });

      return {
        success: true,
        requestId,
        reflections,
        metadata: {
          processingTimeMs: processingTime,
          confidenceLevel,
          recommendedNextSteps,
        },
      };
    } catch (error) {
      return this.handleReflectionError(
        error instanceof Error ? error : new Error(String(error)),
        requestId,
        request,
        startTime
      );
    }
  }

  // ===== PRIVATE METHODS =====

  private validateRequest(request: GenerateReflectionUseCaseRequest): void {
    if (!request.originalQuestion?.trim()) {
      throw ContentError.validationError('originalQuestion', 'Original question is required for reflection generation');
    }

    if (!request.userResponse?.trim()) {
      throw ContentError.validationError('userResponse', 'User response is required for reflection generation');
    }

    if (request.originalQuestion.length > 1000) {
      throw ContentError.validationError(
        'originalQuestion',
        'Original question exceeds maximum length of 1,000 characters'
      );
    }

    if (request.userResponse.length > 5000) {
      throw ContentError.validationError('userResponse', 'User response exceeds maximum length of 5,000 characters');
    }

    if (!['follow-up-questions', 'deeper-challenges', 'insights'].includes(request.reflectionType)) {
      throw ContentError.validationError('reflectionType', 'Invalid reflection type specified');
    }

    if (!['basic', 'comprehensive', 'advanced'].includes(request.depth)) {
      throw ContentError.validationError('depth', 'Invalid depth level specified');
    }
  }

  private async generateReflections(
    request: GenerateReflectionUseCaseRequest
  ): Promise<GenerateReflectionUseCaseResult['reflections']> {
    const reflections: GenerateReflectionUseCaseResult['reflections'] = {};

    // Select frameworks based on user response content
    let frameworkResult: FrameworkSelectionResult | null = null;
    try {
      frameworkResult = await frameworkSelectionService.selectFrameworks(request.userResponse);
      logger.info('Framework selection for reflection', {
        primaryFramework: frameworkResult.primaryFramework?.framework.shortName,
        emotionsDetected: frameworkResult.detectedEmotions,
      });
    } catch (error) {
      logger.warn('Framework selection failed for reflection, continuing without', { error });
    }

    switch (request.reflectionType) {
      case 'follow-up-questions':
        reflections.questions = await this.generateFollowUpQuestions(request, frameworkResult);
        break;
      case 'deeper-challenges':
        reflections.challenges = await this.generateDeeperChallenges(request, frameworkResult);
        break;
      case 'insights':
        reflections.insights = await this.generateInsights(request, frameworkResult);
        reflections.framework = await this.generateFramework(request, frameworkResult);
        break;
    }

    // Add therapeutic framework info if available
    if (frameworkResult) {
      reflections.therapeuticFramework = {
        primary: frameworkResult.primaryFramework
          ? {
              id: frameworkResult.primaryFramework.framework.id,
              name: frameworkResult.primaryFramework.framework.name,
              shortName: frameworkResult.primaryFramework.framework.shortName,
              keyPrinciples: frameworkResult.primaryFramework.framework.keyPrinciples,
              therapeuticGoals: frameworkResult.primaryFramework.framework.therapeuticGoals,
            }
          : undefined,
        detectedEmotions: frameworkResult.detectedEmotions,
        detectedThemes: frameworkResult.detectedThemes,
        therapeuticApproach: frameworkResult.therapeuticApproach,
      };
    }

    return reflections;
  }

  private async generateFollowUpQuestions(
    request: GenerateReflectionUseCaseRequest,
    _frameworkResult?: FrameworkSelectionResult | null
  ): Promise<string[]> {
    const contextInfo = this.buildContextInfo(request);
    const questionCount = this.getQuestionCount(request.depth);

    // Use template engine for follow-up questions
    const templateInput = `Original Question: "${request.originalQuestion}"
User's Response: "${request.userResponse}"
${contextInfo}`;

    const templateResult = await this.templateClient.executeContentTemplate({
      contentType: 'educational',
      userInput: templateInput,
      parameters: {
        maxLength: 800,
        temperature: 0.7,
        tone: 'friendly',
        style: 'educational',
      },
      context: {
        therapeuticFramework: 'reflection-prompts',
        sessionHistory: { questionCount },
      },
      fallbackToDefault: false,
    });

    if (!templateResult.success) {
      const errorMessage =
        typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
      logger.error('Template engine failed for follow-up questions:', {
        error: errorMessage,
      });
      throw TemplateError.executionFailed(`Template engine unavailable for reflection questions: ${errorMessage}`);
    }

    if (!templateResult.processedPrompt) {
      logger.error('Template engine returned empty prompt for follow-up questions');
      throw TemplateError.renderFailed('Template engine returned invalid prompt for reflection questions');
    }

    const prompt = templateResult.processedPrompt;

    try {
      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'educational',
        parameters: {
          maxLength: 800,
          temperature: 0.7,
          tone: 'friendly',
          style: 'educational',
        },
      });

      return this.parseQuestionsFromResponse(response.content, questionCount);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'generateFollowUpQuestions',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in generateFollowUpQuestions: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI question generation failed, using fallback:', { data: error });
      return this.fallbackFollowUpQuestions(request);
    }
  }

  private async generateDeeperChallenges(
    request: GenerateReflectionUseCaseRequest,
    _frameworkResult?: FrameworkSelectionResult | null
  ): Promise<string[]> {
    const contextInfo = this.buildContextInfo(request);
    const challengeCount = this.getChallengeCount(request.depth);

    // Use template engine for deeper challenges
    const templateInput = `Original Question: "${request.originalQuestion}"
User's Response: "${request.userResponse}"
${contextInfo}`;

    const templateResult = await this.templateClient.executeContentTemplate({
      contentType: 'educational',
      userInput: templateInput,
      parameters: {
        maxLength: 600,
        temperature: 0.6,
        tone: 'friendly',
        style: 'educational',
      },
      context: {
        therapeuticFramework: 'reflection-prompts',
        sessionHistory: { challengeCount },
      },
      fallbackToDefault: false,
    });

    if (!templateResult.success) {
      const errorMessage =
        typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
      logger.error('Template engine failed for deeper challenges:', {
        error: errorMessage,
      });
      throw TemplateError.executionFailed(`Template engine unavailable for challenging prompts: ${errorMessage}`);
    }

    if (!templateResult.processedPrompt) {
      logger.error('Template engine returned empty prompt for deeper challenges');
      throw TemplateError.renderFailed('Template engine returned invalid prompt for challenging prompts');
    }

    const prompt = templateResult.processedPrompt;

    try {
      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'educational',
        parameters: {
          maxLength: 600,
          temperature: 0.6,
          tone: 'friendly',
          style: 'educational',
        },
      });

      return this.parseChallengesFromResponse(response.content, challengeCount);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'generateDeeperChallenges',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in generateDeeperChallenges: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI challenge generation failed, using fallback:', { data: error });
      return this.fallbackDeeperChallenges(request);
    }
  }

  private async generateInsights(
    request: GenerateReflectionUseCaseRequest,
    _frameworkResult?: FrameworkSelectionResult | null
  ): Promise<string[]> {
    const contextInfo = this.buildContextInfo(request);
    const insightCount = this.getInsightCount(request.depth);

    // Use template engine for insights
    const templateInput = `Original Question: "${request.originalQuestion}"
User's Response: "${request.userResponse}"
${contextInfo}`;

    const templateResult = await this.templateClient.executeContentTemplate({
      contentType: 'educational',
      userInput: templateInput,
      parameters: {
        maxLength: 700,
        temperature: 0.6,
        tone: 'professional',
        style: 'informative',
      },
      context: {
        therapeuticFramework: 'reflection-prompts',
        sessionHistory: { insightCount },
      },
      fallbackToDefault: false,
    });

    if (!templateResult.success) {
      const errorMessage =
        typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
      logger.error('Template engine failed for insights generation:', {
        error: errorMessage,
      });
      throw TemplateError.executionFailed(`Template engine unavailable for insight generation: ${errorMessage}`);
    }

    if (!templateResult.processedPrompt) {
      logger.error('Template engine returned empty prompt for insights generation');
      throw TemplateError.renderFailed('Template engine returned invalid prompt for insight generation');
    }

    const prompt = templateResult.processedPrompt;

    try {
      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'educational',
        parameters: {
          maxLength: 700,
          temperature: 0.6,
          tone: 'professional',
          style: 'informative',
        },
      });

      return this.parseInsightsFromResponse(response.content, insightCount);
    } catch (error) {
      // In strict mode, throw error instead of using fallback (for debugging)
      if (contentServiceConfig.features.templateStrictMode) {
        logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
          operation: 'generateInsights',
          data: error,
        });
        throw TemplateError.executionFailed(
          `Template execution failed in generateInsights: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      logger.warn('AI insight generation failed, using fallback:', { data: error });
      return this.fallbackInsights(request);
    }
  }

  private async generateFramework(
    request: GenerateReflectionUseCaseRequest,
    frameworkResult?: FrameworkSelectionResult | null
  ): Promise<string> {
    // If we have framework selection result, use it to generate a personalized framework suggestion
    if (frameworkResult?.primaryFramework) {
      const pf = frameworkResult.primaryFramework.framework;
      const principles = pf.keyPrinciples.slice(0, 2).join(' and ');
      return `Based on your response, the ${pf.name} approach may be helpful. Key insight: ${principles}. Consider regularly asking yourself: What patterns am I noticing? How can I apply these principles in my daily life?`;
    }

    // Use template engine for framework generation
    const templateInput = `Original Question: "${request.originalQuestion}"
User's Response: "${request.userResponse}"`;

    const templateResult = await this.templateClient.executeContentTemplate({
      contentType: 'summary',
      userInput: templateInput,
      parameters: {
        maxLength: 200,
        temperature: 0.5,
        tone: 'professional',
        style: 'informative',
      },
      context: {
        therapeuticFramework: 'framework-selection',
      },
      fallbackToDefault: false,
    });

    if (!templateResult.success) {
      const errorMessage =
        typeof templateResult.error === 'string' ? templateResult.error : String(templateResult.error);
      logger.error('Template engine failed for framework generation:', {
        error: errorMessage,
      });
      throw TemplateError.executionFailed(`Template engine unavailable for framework generation: ${errorMessage}`);
    }

    if (!templateResult.processedPrompt) {
      logger.error('Template engine returned empty prompt for framework generation');
      throw TemplateError.renderFailed('Template engine returned invalid prompt for framework generation');
    }

    const prompt = templateResult.processedPrompt;

    try {
      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'summary',
        parameters: {
          maxLength: 200,
          temperature: 0.5,
          tone: 'professional',
          style: 'informative',
        },
      });

      return response.content.trim();
    } catch (error) {
      logger.warn('AI framework generation failed, using fallback:', { data: error });
      return 'Consider regularly asking yourself: What am I learning? How am I growing? What would I do differently?';
    }
  }

  private async generateNextSteps(
    request: GenerateReflectionUseCaseRequest,
    reflections: GenerateReflectionUseCaseResult['reflections']
  ): Promise<string[]> {
    const steps = [
      'Take time to reflect on the generated questions or insights',
      'Write about your entries and feelings regarding this topic',
    ];

    if (reflections.questions && reflections.questions.length > 0) {
      steps.push('Choose one question to focus on for deeper exploration');
    }

    if (reflections.challenges && reflections.challenges.length > 0) {
      steps.push('Consider discussing these challenges with a trusted friend or mentor');
    }

    if (reflections.insights && reflections.insights.length > 0) {
      steps.push('Apply one of these insights to a current situation in your life');
    }

    return steps;
  }

  private calculateConfidenceLevel(
    request: GenerateReflectionUseCaseRequest,
    reflections: GenerateReflectionUseCaseResult['reflections']
  ): number {
    let confidence = 0.6; // Base confidence

    // Increase confidence based on available context
    if (request.context.userHistory && request.context.userHistory.length > 0) confidence += 0.1;

    // Increase confidence based on response quality
    if (request.userResponse.length > 100) confidence += 0.1;
    if (request.depth === 'advanced') confidence += 0.05;

    // Increase confidence based on generated content
    const totalItems =
      (reflections.questions?.length || 0) +
      (reflections.challenges?.length || 0) +
      (reflections.insights?.length || 0);
    if (totalItems >= 3) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  private buildContextInfo(request: GenerateReflectionUseCaseRequest): string {
    let contextInfo = '';

    if (request.context.userHistory && request.context.userHistory.length > 0) {
      contextInfo += '\n\nPrevious Context:';
      const recentHistory = request.context.userHistory.slice(-2); // Last 2 interactions
      recentHistory.forEach((item, index) => {
        contextInfo += `\nQ${index + 1}: ${item.question}\nA${index + 1}: ${item.response}`;
      });
    }

    return contextInfo;
  }

  private getQuestionCount(depth: string): number {
    switch (depth) {
      case 'basic':
        return 2;
      case 'comprehensive':
        return 4;
      case 'advanced':
        return 6;
      default:
        return 3;
    }
  }

  private getChallengeCount(depth: string): number {
    switch (depth) {
      case 'basic':
        return 2;
      case 'comprehensive':
        return 3;
      case 'advanced':
        return 4;
      default:
        return 2;
    }
  }

  private getInsightCount(depth: string): number {
    switch (depth) {
      case 'basic':
        return 2;
      case 'comprehensive':
        return 3;
      case 'advanced':
        return 4;
      default:
        return 2;
    }
  }

  private parseQuestionsFromResponse(aiResponse: string, expectedCount: number): string[] {
    const lines = aiResponse.split('\n').filter(line => line.trim());
    const questions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && (trimmed.includes('?') || /^\d+\./.test(trimmed))) {
        const cleaned = trimmed.replace(/^\d+\.\s*/, '').trim();
        if (cleaned) questions.push(cleaned);
      }
    }

    // Ensure we have the expected number of questions
    while (questions.length < expectedCount) {
      questions.push(`What other aspects of this situation would be worth exploring further?`);
    }

    return questions.slice(0, expectedCount);
  }

  private parseChallengesFromResponse(aiResponse: string, expectedCount: number): string[] {
    const lines = aiResponse.split('\n').filter(line => line.trim());
    const challenges: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && (/^\d+\./.test(trimmed) || trimmed.length > 20)) {
        const cleaned = trimmed.replace(/^\d+\.\s*/, '').trim();
        if (cleaned) challenges.push(cleaned);
      }
    }

    // Ensure we have the expected number of challenges
    while (challenges.length < expectedCount) {
      challenges.push(`Consider challenging your initial assumptions about this situation.`);
    }

    return challenges.slice(0, expectedCount);
  }

  private parseInsightsFromResponse(aiResponse: string, expectedCount: number): string[] {
    const lines = aiResponse.split('\n').filter(line => line.trim());
    const insights: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && (/^\d+\./.test(trimmed) || trimmed.length > 20)) {
        const cleaned = trimmed.replace(/^\d+\.\s*/, '').trim();
        if (cleaned) insights.push(cleaned);
      }
    }

    // Ensure we have the expected number of insights
    while (insights.length < expectedCount) {
      insights.push(`This response reveals important patterns worth exploring further.`);
    }

    return insights.slice(0, expectedCount);
  }

  private fallbackFollowUpQuestions(_request: GenerateReflectionUseCaseRequest): string[] {
    return [
      'What emotions come up for you when you think about this situation?',
      'How might someone else view this differently?',
      'What would you tell a friend in a similar situation?',
    ];
  }

  private fallbackDeeperChallenges(_request: GenerateReflectionUseCaseRequest): string[] {
    return [
      'What assumptions might you be making that could be worth questioning?',
      'How might your past experiences be influencing your perspective on this?',
    ];
  }

  private fallbackInsights(_request: GenerateReflectionUseCaseRequest): string[] {
    return [
      'Your response suggests you have strong awareness of your situation',
      'There may be opportunities to view this challenge as a growth opportunity',
    ];
  }

  private handleReflectionError(
    error: Error,
    requestId: string,
    request: GenerateReflectionUseCaseRequest,
    startTime: number
  ): GenerateReflectionUseCaseResult {
    const processingTime = Date.now() - startTime;

    void this.recordAnalyticsSafely({
      eventType: 'reflection_generation_failed',
      eventData: {
        requestId,
        success: false,
        reflectionType: request.reflectionType,
        depth: request.depth,
        error: error.message,
        processingTime,
      },
    });

    logger.error('Reflection generation failed for request ${requestId}:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      requestId,
      reflections: {},
      metadata: {
        processingTimeMs: processingTime,
        confidenceLevel: 0.0,
        recommendedNextSteps: ['Please try again or contact support if the problem persists'],
      },
      error: error.message,
    };
  }

  private async recordAnalyticsSafely(event: { eventType: string; eventData: Record<string, unknown> }): Promise<void> {
    if (!this.analyticsService) return;

    try {
      this.analyticsService
        .recordEvent({
          eventType: event.eventType,
          eventData: event.eventData,
          timestamp: new Date(),
          metadata: {
            service: 'ai-content-service',
            useCase: 'GenerateReflectionUseCase',
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to record analytics (non-blocking):', { data: error.message });
        });
    } catch (error) {
      logger.warn('Failed to initiate analytics recording (non-blocking):', { data: error });
    }
  }
}
