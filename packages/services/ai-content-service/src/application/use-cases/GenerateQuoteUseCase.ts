/**
 * Generate Quote Use Case - Personalized inspirational quote generation
 * Generates short, powerful quotes based on user's entries, emotions and profile
 * Uses database-stored template for prompt management
 */

import { v4 as uuidv4 } from 'uuid';
import { ContentAIService } from '../../domains/services/ContentAIService';
import { TemplateEngineServiceClient } from '../../infrastructure/clients/TemplateEngineServiceClient';
import { TEMPLATE_IDS } from '../../infrastructure/clients/TemplateIds';
import { getLogger } from '../../config/service-urls';
import { contentServiceConfig } from '../../config/service-config';

const logger = getLogger('ai-content-service-generatequoteusecase');

// Map i18n language codes to full language names for AI prompts
const LANGUAGE_CODE_MAP: Record<string, string> = {
  en: 'English',
  'en-US': 'English',
  fr: 'French',
  'fr-FR': 'French',
  es: 'Spanish',
  'es-ES': 'Spanish',
  de: 'German',
  'de-DE': 'German',
  pt: 'Portuguese',
  'pt-BR': 'Portuguese',
  ar: 'Arabic',
};

/**
 * Convert language code to full language name for AI prompts
 * Returns undefined for 'auto-detect' or empty values so AI detects from context
 */
function getLanguageName(languageCode: string | undefined): string | undefined {
  if (!languageCode || languageCode === 'auto-detect') {
    return undefined;
  }
  // Check exact match first, then try base language code
  return LANGUAGE_CODE_MAP[languageCode] || LANGUAGE_CODE_MAP[languageCode.split('-')[0]] || languageCode;
}

export interface GenerateQuoteUseCaseRequest {
  userId: string;
  userEntries?: string;
  emotionalState?: string;
  userProfile?: {
    tendencies?: string[];
    focusAreas?: string[];
  };
  theme?: string;
  language?: string;
}

export interface GenerateQuoteUseCaseResult {
  success: boolean;
  requestId: string;
  quote: string;
  metadata: {
    processingTimeMs: number;
    theme?: string;
    emotionalTone?: string;
    templateUsed?: string;
  };
  fallback?: boolean;
  error?: string;
}

export class GenerateQuoteUseCase {
  private readonly templateClient: TemplateEngineServiceClient;

  constructor(private readonly contentAIService: ContentAIService) {
    this.templateClient = new TemplateEngineServiceClient();
  }

  async execute(request: GenerateQuoteUseCaseRequest): Promise<GenerateQuoteUseCaseResult> {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      // Convert language code to full name (e.g., 'fr-FR' -> 'French')
      const languageName = getLanguageName(request.language) || 'English';
      // Keep raw code for fallback quotes which uses language code
      const languageCode = request.language || 'en';

      logger.info('Generating personalized quote', {
        requestId,
        userId: request.userId,
        hasEntries: !!request.userEntries,
        hasEmotionalState: !!request.emotionalState,
        hasProfile: !!request.userProfile,
        theme: request.theme,
        languageCode,
        languageName,
      });

      const userProfileString = this.buildUserProfileString(request.userProfile);

      // Add randomness seed to ensure variety in quotes
      const randomSeed = Math.random().toString(36).substring(7);
      const momentPhrases = [
        'seeking clarity and direction',
        'embracing a moment of reflection',
        'looking for inner strength',
        'opening to new possibilities',
        'finding peace in the present',
        'cultivating gratitude',
        'nurturing self-compassion',
        'exploring their inner wisdom',
        'seeking balance and harmony',
        'embracing personal growth',
      ];
      const randomMoment = momentPhrases[Math.floor(Math.random() * momentPhrases.length)];
      const defaultInput = `The user is ${randomMoment}. (Unique context: ${randomSeed})`;

      const templateResult = await this.templateClient.executeContentTemplate({
        templateId: TEMPLATE_IDS.QUOTE_INSPIRATION,
        contentType: 'creative',
        userInput: request.userEntries || defaultInput,
        parameters: {
          maxLength: 200,
          temperature: 0.9,
          tone: (request.emotionalState || 'friendly') as 'friendly',
          style: (userProfileString || 'narrative') as 'narrative',
          targetAudience: request.theme || undefined,
          // Pass full language name for AI prompt (e.g., 'French' not 'fr')
          language: languageName,
        },
        context: {
          userId: request.userId,
          emotionalState: request.emotionalState || 'Open and receptive',
          userProfile: {
            tendencies: request.userProfile?.tendencies,
            focusAreas: request.userProfile?.focusAreas,
            profileString: userProfileString,
            language: languageName,
          },
          culturalContext: 'universal',
        },
        fallbackToDefault: false,
      });

      if (!templateResult.success) {
        logger.warn('Template execution failed, using fallback:', {
          error: templateResult.error,
        });
        return this.handleFallback(requestId, startTime, request, templateResult.error);
      }

      if (!templateResult.processedPrompt && !templateResult.userPrompt) {
        logger.warn('Template returned empty prompt, using fallback');
        return this.handleFallback(requestId, startTime, request, 'Empty template prompt');
      }

      const prompt = templateResult.processedPrompt || templateResult.userPrompt || '';

      const response = await this.contentAIService.generateContent({
        prompt,
        contentType: 'creative',
        parameters: {
          maxLength: 200,
          temperature: 0.8,
          tone: 'friendly',
          style: 'narrative',
          // Pass full language name for ContentAIService (e.g., 'French' not 'fr')
          language: languageName,
        },
        options: {
          formatOutput: 'plain',
        },
        context: templateResult.systemPrompt
          ? {
              systemPrompt: templateResult.systemPrompt,
            }
          : undefined,
      });

      const quote = this.cleanQuote(response.content);

      const processingTime = Date.now() - startTime;

      logger.info('Quote generated successfully', {
        requestId,
        processingTimeMs: processingTime,
        quoteLength: quote.length,
        templateUsed: TEMPLATE_IDS.QUOTE_INSPIRATION,
      });

      return {
        success: true,
        requestId,
        quote,
        metadata: {
          processingTimeMs: processingTime,
          theme: request.theme,
          emotionalTone: request.emotionalState,
          templateUsed: TEMPLATE_IDS.QUOTE_INSPIRATION,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Quote generation failed', {
        requestId,
        error: errorMessage,
        processingTimeMs: processingTime,
      });

      return this.handleFallback(requestId, processingTime, request, errorMessage);
    }
  }

  private buildUserProfileString(userProfile?: GenerateQuoteUseCaseRequest['userProfile']): string {
    if (!userProfile) return '';

    const parts: string[] = [];
    if (userProfile.tendencies?.length) {
      parts.push(`tendencies: ${userProfile.tendencies.join(', ')}`);
    }
    if (userProfile.focusAreas?.length) {
      parts.push(`focus areas: ${userProfile.focusAreas.join(', ')}`);
    }
    return parts.join('; ');
  }

  private handleFallback(
    requestId: string,
    processingTimeMs: number,
    request: GenerateQuoteUseCaseRequest,
    errorMessage?: string
  ): GenerateQuoteUseCaseResult {
    // In strict mode, throw error instead of using fallback (for debugging)
    if (contentServiceConfig.features.templateStrictMode) {
      const error = new Error(`Template ${TEMPLATE_IDS.QUOTE_INSPIRATION} failed: ${errorMessage || 'unknown error'}`);
      logger.error('TEMPLATE_STRICT_MODE: Throwing error instead of fallback', {
        requestId,
        templateId: TEMPLATE_IDS.QUOTE_INSPIRATION,
        reason: errorMessage,
      });
      throw error;
    }

    const quote = this.getFallbackQuote(request.language);

    logger.info('Using fallback quote', {
      requestId,
      reason: errorMessage,
      language: request.language,
    });

    return {
      success: true,
      requestId,
      quote,
      metadata: {
        processingTimeMs,
        theme: request.theme,
        emotionalTone: request.emotionalState,
      },
      fallback: true,
      error: errorMessage,
    };
  }

  private cleanQuote(rawQuote: string): string {
    let quote = rawQuote.trim();

    if ((quote.startsWith('"') && quote.endsWith('"')) || (quote.startsWith("'") && quote.endsWith("'"))) {
      quote = quote.slice(1, -1);
    }

    quote = quote.replace(/^["'«»„"']+|["'«»„"']+$/g, '');

    return quote.trim();
  }

  private getFallbackQuote(language?: string): string {
    const fallbackQuotesByLanguage: Record<string, string[]> = {
      en: [
        'In the pause between entries, clarity finds its voice.',
        'Growth often wears the quiet disguise of daily moments.',
        'The path forward reveals itself one truthful step at a time.',
        'Within stillness, your next chapter is already being written.',
        'What you seek is also seeking you through your own becoming.',
      ],
      de: [
        'In der Stille zwischen den Gedanken findet Klarheit ihre Stimme.',
        'Wachstum trägt oft die leise Verkleidung alltäglicher Momente.',
        'Der Weg nach vorne zeigt sich einen wahrhaftigen Schritt nach dem anderen.',
        'In der Stille wird dein nächstes Kapitel bereits geschrieben.',
        'Was du suchst, sucht auch dich durch dein eigenes Werden.',
      ],
      es: [
        'En la pausa entre pensamientos, la claridad encuentra su voz.',
        'El crecimiento a menudo lleva el disfraz silencioso de los momentos cotidianos.',
        'El camino hacia adelante se revela un paso sincero a la vez.',
        'En la quietud, tu próximo capítulo ya está siendo escrito.',
        'Lo que buscas también te busca a través de tu propio devenir.',
      ],
      fr: [
        'Dans la pause entre les pensées, la clarté trouve sa voix.',
        'La croissance porte souvent le déguisement discret des moments quotidiens.',
        'Le chemin se révèle un pas sincère à la fois.',
        "Dans le silence, ton prochain chapitre s'écrit déjà.",
        'Ce que tu cherches te cherche aussi à travers ton propre devenir.',
      ],
      pt: [
        'Na pausa entre os pensamentos, a clareza encontra sua voz.',
        'O crescimento frequentemente usa o disfarce silencioso dos momentos diários.',
        'O caminho à frente se revela um passo verdadeiro de cada vez.',
        'Na quietude, seu próximo capítulo já está sendo escrito.',
        'O que você busca também te busca através do seu próprio tornar-se.',
      ],
      ar: [
        'في السكون بين الأفكار، يجد الوضوح صوته.',
        'النمو غالباً ما يرتدي قناع اللحظات اليومية الهادئة.',
        'الطريق إلى الأمام يتكشف خطوة صادقة في كل مرة.',
        'في الصمت، فصلك التالي يُكتب بالفعل.',
        'ما تبحث عنه يبحث عنك أيضاً من خلال صيرورتك.',
      ],
    };

    const langCode = language?.split('-')[0]?.toLowerCase() || 'en';
    const quotes = fallbackQuotesByLanguage[langCode] || fallbackQuotesByLanguage.en;
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
}
