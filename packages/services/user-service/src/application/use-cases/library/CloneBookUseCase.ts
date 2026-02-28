/**
 * Clone Book Use Case
 * Lets eligible users (Personal tier+) clone any accessible shared/public book.
 * The source book's structure is injected into the AI prompt together with
 * the user's adaptation request, then the full book (chapters + entries with
 * actual content) is generated asynchronously.  The caller receives a
 * requestId immediately and polls the existing generation-status endpoint.
 */

import {
  BookGenerationRepository,
  type GeneratedBookData,
  BookRepository,
  ChapterRepository,
  SubscriptionRepository,
  AuthRepository,
} from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger, SERVICE_URLS, createServiceHttpClient } from '@config/service-urls';
import {
  isPrivilegedRole,
  normalizeRole,
  CONTENT_VISIBILITY,
  SUBSCRIPTION_STATUS,
  type UserRole,
} from '@aiponge/shared-contracts';
import { TierConfigClient } from '@aiponge/platform-core';
import type { Book, Chapter } from '@infrastructure/database/schemas/library-schema';
import { BOOK_TYPE_IDS } from '@infrastructure/database/schemas/library-schema';

const logger = getLogger('clone-book-usecase');
const httpClient = createServiceHttpClient('internal');

const STALE_REQUEST_THRESHOLD_MS = 5 * 60 * 1000;

const DEPTH_CONFIG = {
  brief: { chapters: '3-5', wordsPerEntry: '80-150' },
  standard: { chapters: '6-10', wordsPerEntry: '200-350' },
  deep: { chapters: '12-18', wordsPerEntry: '400-700' },
} as const;

interface CloneBookInput {
  userId: string;
  userRole?: UserRole;
  sourceBookId: string;
  modificationPrompt: string;
  language?: string;
  depthLevel?: 'brief' | 'standard' | 'deep';
}

interface CloneBookResult {
  success: boolean;
  requestId?: string;
  status?: string;
  error?: string;
}

export class CloneBookUseCase {
  private bookGenerationRepository = createDrizzleRepository(BookGenerationRepository);
  private bookRepository = createDrizzleRepository(BookRepository);
  private chapterRepository = createDrizzleRepository(ChapterRepository);
  private subscriptionRepository = createDrizzleRepository(SubscriptionRepository);
  private authRepository = createDrizzleRepository(AuthRepository);
  private tierConfigClient = new TierConfigClient();

  async execute(input: CloneBookInput): Promise<CloneBookResult> {
    const { userId, userRole, sourceBookId, modificationPrompt, language, depthLevel = 'standard' } = input;

    if (!modificationPrompt || modificationPrompt.trim().length < 10) {
      return {
        success: false,
        error: 'Please describe how you would like to adapt this book (at least 10 characters)',
      };
    }

    if (modificationPrompt.length > 500) {
      return { success: false, error: 'Adaptation description must be 500 characters or less' };
    }

    const sourceBook = await this.bookRepository.getById(sourceBookId);
    if (!sourceBook) {
      return { success: false, error: 'Source book not found' };
    }

    const isOwned = sourceBook.userId === userId;
    const isAccessible =
      isOwned ||
      sourceBook.visibility === CONTENT_VISIBILITY.SHARED ||
      sourceBook.visibility === CONTENT_VISIBILITY.PUBLIC;

    if (!isAccessible) {
      return { success: false, error: 'You do not have access to clone this book' };
    }

    const accessCheck = await this.checkAccess(userId, userRole, depthLevel);
    if (!accessCheck.hasAccess) {
      return { success: false, error: accessCheck.message };
    }

    const activeRequest = await this.bookGenerationRepository.getActiveRequestForUser(userId);
    if (activeRequest) {
      const ageMs = Date.now() - new Date(activeRequest.createdAt).getTime();
      if (ageMs > STALE_REQUEST_THRESHOLD_MS) {
        await this.bookGenerationRepository.updateStatus(activeRequest.id, 'failed', {
          errorMessage: 'Generation timed out. Please try again.',
        });
      } else {
        logger.info('Duplicate clone request blocked — returning existing request', {
          userId,
          existingRequestId: activeRequest.id,
        });
        return { success: true, requestId: activeRequest.id, status: activeRequest.status };
      }
    }

    const chapters = await this.chapterRepository.getByBook(sourceBookId);

    try {
      const bookRequest = await this.bookGenerationRepository.createRequest({
        userId,
        primaryGoal: modificationPrompt.trim(),
        language: language || 'en-US',
        generationMode: 'book',
        depthLevel,
        bookTypeId: sourceBook.typeId || undefined,
      });

      this.generateClone(
        bookRequest.id,
        sourceBook,
        chapters,
        modificationPrompt.trim(),
        language || 'en-US',
        depthLevel
      ).catch(err => {
        logger.error('Background clone generation failed', { requestId: bookRequest.id, error: err });
      });

      return { success: true, requestId: bookRequest.id, status: 'pending' };
    } catch (error) {
      logger.error('Failed to create clone book generation request', { userId, sourceBookId, error });
      return { success: false, error: 'Failed to start book cloning' };
    }
  }

  private async checkAccess(
    userId: string,
    userRole: UserRole | undefined,
    requestedDepth: 'brief' | 'standard' | 'deep'
  ): Promise<{ hasAccess: boolean; message?: string }> {
    if (userRole && isPrivilegedRole(userRole)) {
      return { hasAccess: true };
    }

    const [user, subscription] = await Promise.all([
      this.authRepository.getUserById(userId),
      this.subscriptionRepository.getSubscriptionByUserId(userId),
    ]);

    if (user && isPrivilegedRole(normalizeRole(user.role))) {
      return { hasAccess: true };
    }

    if (!subscription) {
      return { hasAccess: false, message: 'No subscription found' };
    }

    if (subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
      return { hasAccess: false, message: 'Your subscription is not active' };
    }

    const tier = subscription.subscriptionTier;
    const canGenerate = await this.tierConfigClient.hasFeature(tier, 'canGenerateBooks');

    if (!canGenerate) {
      return { hasAccess: false, message: 'Cloning books requires a Personal or higher subscription' };
    }

    const canAccessDepth = await this.tierConfigClient.canGenerateBookAtDepth(tier, requestedDepth);
    if (!canAccessDepth) {
      const maxDepth = await this.tierConfigClient.getMaxBookDepth(tier);
      const depthNames: Record<string, string> = { brief: 'Brief', standard: 'Standard', deep: 'Deep' };
      return {
        hasAccess: false,
        message: `${depthNames[requestedDepth]} depth requires a Practice or higher subscription. Your plan allows ${maxDepth ? depthNames[maxDepth] : 'no'} depth.`,
      };
    }

    return { hasAccess: true };
  }

  private buildSourceContext(sourceBook: Book, chapters: Chapter[]): string {
    const lines: string[] = [];
    lines.push(`Title: ${sourceBook.title}`);
    if (sourceBook.description) {
      lines.push(`Description: ${sourceBook.description}`);
    }
    if (chapters.length > 0) {
      lines.push(`Chapters (${chapters.length} total):`);
      const displayChapters = chapters.slice(0, 12);
      displayChapters.forEach((ch, idx) => {
        lines.push(`  ${idx + 1}. ${ch.title}`);
      });
      if (chapters.length > 12) {
        lines.push(`  ... and ${chapters.length - 12} more chapters`);
      }
    }
    return lines.join('\n');
  }

  private async generateClone(
    requestId: string,
    sourceBook: Book,
    chapters: Chapter[],
    modificationPrompt: string,
    language: string,
    depthLevel: 'brief' | 'standard' | 'deep'
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.bookGenerationRepository.updateStatus(requestId, 'processing');
      await this.bookGenerationRepository.updateProgress(requestId, {
        phase: 'chapters',
        totalChapters: 0,
        completedChapters: 0,
        chapters: [],
      });

      const sourceContext = this.buildSourceContext(sourceBook, chapters);
      const depthCfg = DEPTH_CONFIG[depthLevel];

      const systemPrompt = `You are a personal-growth book author. Generate a complete personalized book inspired by a source book, adapted to the user's specific request. Return ONLY valid JSON — no markdown, no code fences, no explanation — in exactly this structure:
{
  "title": "string (max 50 chars, 2-5 words)",
  "subtitle": "string (concise subtitle, max 100 chars)",
  "description": "string (brief overview)",
  "category": "string (one of: emotions, growth, purpose, relationships, mindfulness, resilience, wisdom, creativity, spirituality, wellbeing, educational)",
  "chapters": [
    {
      "title": "string",
      "description": "string",
      "order": 1,
      "entries": [
        {
          "prompt": "string",
          "type": "reflection",
          "content": "string"
        }
      ]
    }
  ]
}
Guidelines:
- Generate ${depthCfg.chapters} chapters, each with 2-4 entries
- Each entry content should be ${depthCfg.wordsPerEntry} words
- Write in language: ${language}
- The content must be actionable and grounded in the user's adaptation request
- Keep the spirit and structure of the source, but fully tailor the content`;

      const userPrompt = `SOURCE BOOK:\n${sourceContext}\n\nUSER ADAPTATION REQUEST:\n${modificationPrompt}\n\nGenerate the complete personalized book now.`;

      const maxTokens = depthLevel === 'brief' ? 4000 : depthLevel === 'standard' ? 8000 : 14000;
      const timeoutMs = depthLevel === 'deep' ? 180000 : 120000;

      const generationUrl = `${SERVICE_URLS.aiConfigService}/api/providers/invoke`;
      const llmResponse = await httpClient.postWithResponse(
        generationUrl,
        {
          operation: 'text_generation',
          payload: { userPrompt, systemPrompt, maxTokens, temperature: 0.75 },
          options: { timeout: timeoutMs, retries: 1, responseFormat: 'json' },
          metadata: { sourceService: 'user-service', operation: 'clone-book', timestamp: new Date().toISOString() },
        },
        { timeout: timeoutMs }
      );

      if (!llmResponse.ok) {
        const errorData = typeof llmResponse.data === 'string' ? llmResponse.data : JSON.stringify(llmResponse.data);
        throw new Error(`LLM generation failed: ${errorData}`);
      }

      const llmResult = (llmResponse.data && typeof llmResponse.data === 'object' ? llmResponse.data : {}) as Record<
        string,
        unknown
      >;
      if (!llmResult.success || !llmResult.data) {
        const errObj =
          typeof llmResult.error === 'object' && llmResult.error !== null
            ? (llmResult.error as Record<string, unknown>)
            : null;
        throw new Error(typeof errObj?.message === 'string' ? errObj.message : 'Provider invocation failed');
      }

      const llmData = (typeof llmResult.data === 'object' && llmResult.data !== null ? llmResult.data : {}) as Record<
        string,
        unknown
      >;
      const generatedContent = llmData.result || llmData.content || llmData.text;
      if (!generatedContent) {
        throw new Error('LLM returned empty response');
      }

      const contentString = typeof generatedContent === 'string' ? generatedContent : JSON.stringify(generatedContent);
      const bookData = this.parseBookJson(contentString, requestId);

      await this.bookGenerationRepository.updateStatus(requestId, 'completed', {
        generatedBook: {
          ...bookData,
          typeId: sourceBook.typeId || BOOK_TYPE_IDS.PERSONAL,
          language,
          subtitle: bookData.subtitle || sourceBook.subtitle || undefined,
        },
        usedSystemPrompt: systemPrompt,
        usedUserPrompt: userPrompt,
        providerMetadata: {
          latencyMs: Date.now() - startTime,
          sourceBookId: sourceBook.id,
          depthLevel,
          operation: 'clone',
        },
      });

      logger.info('Clone book generation completed', {
        requestId,
        sourceBookId: sourceBook.id,
        depthLevel,
        elapsedMs: Date.now() - startTime,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Clone book generation failed', {
        requestId,
        sourceBookId: sourceBook.id,
        error: errorMessage,
        elapsedMs: Date.now() - startTime,
      });

      await this.bookGenerationRepository.updateStatus(requestId, 'failed', {
        errorMessage,
        providerMetadata: { latencyMs: Date.now() - startTime, error: errorMessage },
      });
    }
  }

  private parseBookJson(contentString: string, requestId: string): GeneratedBookData {
    let jsonString = contentString;

    const codeBlockMatch = contentString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }

    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON object found in clone LLM response', {
        requestId,
        content: contentString.substring(0, 500),
      });
      throw new Error('No JSON found in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeneratedBookData;

    if (!parsed.title || !Array.isArray(parsed.chapters)) {
      throw new Error('Generated book JSON is missing required fields (title, chapters)');
    }

    return parsed;
  }
}
