/**
 * Generate Book Use Case
 * Generates AI-powered book structure blueprints from user description.
 * Creates a blueprint (chapters/entries structure) that can be converted to real Book entities.
 *
 * Template selection is data-driven via lib_book_types.prompt_template_id:
 * - personal → 'personal-book' template (lightweight blueprint)
 * - all other types → promptTemplateId from the database record
 *
 * Paid tier feature only.
 */

import { BookGenerationRepository, GeneratedBookData, BookTypeRepository, type Source } from '@infrastructure/repositories';
import { SubscriptionRepository } from '@infrastructure/repositories';
import { AuthRepository } from '@infrastructure/repositories';
import { createDrizzleRepository } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger, SERVICE_URLS, createServiceHttpClient } from '@config/service-urls';
import {
  isPrivilegedRole,
  normalizeRole,
  BOOK_TYPE_IDS,
  SUBSCRIPTION_STATUS,
  type UserRole,
  type BookDepthLevel,
} from '@aiponge/shared-contracts';
import { TierConfigClient } from '@aiponge/platform-core';
import type { BookGenerationRequest } from '@infrastructure/database/schemas/profile-schema';
import { LibraryError } from '@application/errors';

const logger = getLogger('generate-book-usecase');
const httpClient = createServiceHttpClient('internal');

interface GenerateBookRequestInput {
  userId: string;
  userRole?: UserRole;
  primaryGoal: string;
  language?: string;
  tone?: 'supportive' | 'challenging' | 'neutral';
  generationMode?: 'blueprint' | 'book';
  depthLevel?: 'brief' | 'standard' | 'deep';
  bookTypeId?: string;
}

interface GenerationProgress {
  phase: 'outline' | 'chapters';
  totalChapters: number;
  completedChapters: number;
  bookTitle?: string;
  chapters: Array<{ title: string; status: 'pending' | 'generating' | 'completed' | 'failed' }>;
}

interface GenerateBookResponse {
  success: boolean;
  requestId?: string;
  status?: string;
  book?: GeneratedBookData;
  usedSystemPrompt?: string;
  usedUserPrompt?: string;
  error?: string;
  progress?: GenerationProgress;
}

function stripMarkdownFormatting(text: string): string {
  let result = text;
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\b\*([^*]+)\*\b/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/\b_([^_]+)_\b/g, '$1');
  result = result.replace(/^#{1,6}\s+/gm, '');
  result = result.replace(/^[-*]\s+(?!\[)/gm, '');
  result = result.replace(/^\d+\)\s+/gm, '');
  result = result.replace(/```[^`]*```/g, '');
  result = result.replace(/`([^`]+)`/g, '$1');
  return result.trim();
}

const PERSONAL_TEMPLATE_ID = 'personal-book';
const FALLBACK_TEMPLATE_ID = 'book-wisdom';
const STALE_REQUEST_THRESHOLD_MS = 5 * 60 * 1000;

function isGeneratedBookType(bookTypeId: string | undefined): boolean {
  return !!bookTypeId && bookTypeId !== BOOK_TYPE_IDS.PERSONAL;
}

const DEPTH_CONFIG = {
  brief: { minEntries: 3, maxEntries: 5, wordRange: '100-200' },
  standard: { minEntries: 8, maxEntries: 12, wordRange: '300-500' },
  deep: { minEntries: 15, maxEntries: 25, wordRange: '600-1000' },
} as const;

export class GenerateBookUseCase {
  private bookRepository = createDrizzleRepository(BookGenerationRepository);
  private bookTypeRepository = createDrizzleRepository(BookTypeRepository);
  private subscriptionRepository = createDrizzleRepository(SubscriptionRepository);
  private authRepository = createDrizzleRepository(AuthRepository);
  private tierConfigClient = new TierConfigClient();

  private async resolveTemplateId(bookTypeId: string | undefined): Promise<string> {
    if (!bookTypeId || bookTypeId === BOOK_TYPE_IDS.PERSONAL) return PERSONAL_TEMPLATE_ID;

    const bookType = await this.bookTypeRepository.getById(bookTypeId);
    if (bookType?.promptTemplateId) {
      return bookType.promptTemplateId;
    }

    logger.warn('No promptTemplateId found in DB for book type, using fallback', { bookTypeId });
    return FALLBACK_TEMPLATE_ID;
  }

  async checkBookAccess(
    userId: string,
    userRole?: UserRole,
    requestedDepth: 'brief' | 'standard' | 'deep' = 'standard'
  ): Promise<{ hasAccess: boolean; maxDepth?: BookDepthLevel; message?: string }> {
    if (userRole && isPrivilegedRole(userRole)) {
      logger.info('Book access granted via header role', { userId, userRole });
      return { hasAccess: true, maxDepth: 'deep' };
    }

    const [user, subscription] = await Promise.all([
      this.authRepository.getUserById(userId),
      this.subscriptionRepository.getSubscriptionByUserId(userId),
    ]);

    if (user && isPrivilegedRole(normalizeRole(user.role))) {
      return { hasAccess: true, maxDepth: 'deep' };
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
      return { hasAccess: false, message: 'Book generation requires a Personal or higher subscription' };
    }

    const [maxDepth, canAccessDepth] = await Promise.all([
      this.tierConfigClient.getMaxBookDepth(tier),
      this.tierConfigClient.canGenerateBookAtDepth(tier, requestedDepth),
    ]);

    if (!canAccessDepth) {
      const depthNames: Record<string, string> = {
        brief: 'Brief',
        standard: 'Standard',
        deep: 'Deep',
      };
      return {
        hasAccess: false,
        maxDepth,
        message: `${depthNames[requestedDepth]} depth requires a Practice or higher subscription. Your plan allows ${maxDepth ? depthNames[maxDepth] : 'no'} depth.`,
      };
    }

    return { hasAccess: true, maxDepth };
  }

  async createRequest(request: GenerateBookRequestInput): Promise<GenerateBookResponse> {
    const { userId, userRole, primaryGoal, language, tone, generationMode, depthLevel } = request;
    const resolvedBookTypeId = request.bookTypeId;
    const isGenerated = isGeneratedBookType(resolvedBookTypeId);

    const accessCheck = await this.checkBookAccess(userId, userRole, depthLevel || 'standard');
    if (!accessCheck.hasAccess) {
      return { success: false, error: accessCheck.message };
    }

    if (!primaryGoal || primaryGoal.trim().length < 10) {
      return {
        success: false,
        error: 'Please provide a more detailed description (at least 10 characters)',
      };
    }

    const maxDescriptionLength = isGenerated ? 5000 : 500;
    if (primaryGoal.length > maxDescriptionLength) {
      const itemType = isGenerated ? 'Book summary' : 'Book goal description';
      return { success: false, error: `${itemType} must be ${maxDescriptionLength} characters or less` };
    }

    if (isGenerated && !depthLevel) {
      return {
        success: false,
        error: 'Depth level is required for generated books',
      };
    }

    const activeRequest = await this.bookRepository.getActiveRequestForUser(userId);
    if (activeRequest) {
      const ageMs = Date.now() - new Date(activeRequest.createdAt).getTime();
      if (ageMs > STALE_REQUEST_THRESHOLD_MS) {
        logger.warn('Found stale active request during dedup check, auto-failing', {
          requestId: activeRequest.id,
          ageMs,
        });
        await this.bookRepository.updateStatus(activeRequest.id, 'failed', {
          errorMessage: 'Generation timed out. Please try again.',
        });
      } else {
        logger.info('Duplicate generation request blocked', {
          userId,
          existingRequestId: activeRequest.id,
          existingStatus: activeRequest.status,
        });
        return {
          success: true,
          requestId: activeRequest.id,
          status: activeRequest.status,
        };
      }
    }

    try {
      const bookRequest = await this.bookRepository.createRequest({
        userId,
        primaryGoal: primaryGoal.trim(),
        language: language || 'en-US',
        tone,
        generationMode: generationMode || (isGenerated ? 'book' : 'blueprint'),
        depthLevel,
        bookTypeId: resolvedBookTypeId,
      });

      this.generateBook(bookRequest.id, bookRequest, resolvedBookTypeId).catch(err => {
        logger.error('Background book generation failed', { requestId: bookRequest.id, error: err });
      });

      return {
        success: true,
        requestId: bookRequest.id,
        status: 'pending',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isUniqueViolation = errorMsg.includes('unique') || errorMsg.includes('duplicate') || errorMsg.includes('uq_lib_book_gen_one_active_per_user');
      if (isUniqueViolation) {
        logger.info('Concurrent book generation request blocked by unique constraint', { userId });
        const existingRequest = await this.bookRepository.getActiveRequestForUser(userId);
        if (existingRequest) {
          return { success: true, requestId: existingRequest.id, status: existingRequest.status };
        }
      }
      logger.error('Failed to create book generation request', { userId, error });
      return { success: false, error: 'Failed to create book generation request' };
    }
  }

  async getRequestStatus(requestId: string, userId: string): Promise<GenerateBookResponse> {
    const request = await this.bookRepository.getRequestByIdAndUser(requestId, userId);

    if (!request) {
      return { success: false, error: 'Book generation request not found' };
    }

    const isTerminal = request.status === 'completed' || request.status === 'partial_success' || request.status === 'failed';
    return {
      success: true,
      requestId: request.id,
      status: request.status,
      book: isTerminal && request.status !== 'failed' ? (request.generatedBlueprint as GeneratedBookData) : undefined,
      usedSystemPrompt: isTerminal && request.status !== 'failed' ? request.usedSystemPrompt || undefined : undefined,
      usedUserPrompt: isTerminal && request.status !== 'failed' ? request.usedUserPrompt || undefined : undefined,
      error: request.status === 'failed' ? request.errorMessage || 'Generation failed' : undefined,
      progress: (request.progress as GenerationProgress) || undefined,
    };
  }

  async getRequestStatusWithProgress(
    requestId: string,
    userId: string
  ): Promise<{
    status: string;
    book?: GeneratedBookData;
    error?: string;
    progress?: Record<string, unknown>;
  } | null> {
    const request = await this.bookRepository.getRequestByIdAndUser(requestId, userId);
    if (!request) return null;

    const hasBook = request.status === 'completed' || request.status === 'partial_success';
    return {
      status: request.status,
      book: hasBook ? (request.generatedBlueprint as GeneratedBookData) : undefined,
      error: request.status === 'failed' ? request.errorMessage || 'Generation failed' : undefined,
      progress: (request.progress as Record<string, unknown>) || undefined,
    };
  }

  async regenerate(requestId: string, userId: string, userRole?: UserRole): Promise<GenerateBookResponse> {
    const existingRequest = await this.bookRepository.getRequestByIdAndUser(requestId, userId);

    if (!existingRequest) {
      return { success: false, error: 'Book generation request not found' };
    }

    const depthLevel = (existingRequest.depthLevel as 'brief' | 'standard' | 'deep') || 'standard';
    const accessCheck = await this.checkBookAccess(userId, userRole, depthLevel);
    if (!accessCheck.hasAccess) {
      return { success: false, error: accessCheck.message };
    }

    const existingBookTypeId =
      existingRequest.bookTypeId ||
      ((existingRequest.providerMetadata as Record<string, unknown>)?.bookTypeId as string | undefined);

    const newRequest = await this.bookRepository.createRequest({
      userId,
      primaryGoal: existingRequest.primaryGoal,
      language: existingRequest.language || 'en-US',
      tone: existingRequest.tone || undefined,
      generationMode: (existingRequest.generationMode as 'blueprint' | 'book') || 'blueprint',
      depthLevel: (existingRequest.depthLevel as 'brief' | 'standard' | 'deep') || undefined,
      bookTypeId: existingBookTypeId,
    });

    this.generateBook(newRequest.id, newRequest, existingBookTypeId).catch(err => {
      logger.error('Background book regeneration failed', { requestId: newRequest.id, error: err });
    });

    return {
      success: true,
      requestId: newRequest.id,
      status: 'pending',
    };
  }

  private extractJson<T = GeneratedBookData>(contentString: string, requestId: string): T {
    let jsonString = contentString;

    const codeBlockMatch = contentString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
      logger.debug('Extracted JSON from code block', { requestId });
    }

    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON object found in LLM response', { requestId, content: contentString.substring(0, 500) });
      throw LibraryError.aiGenerationFailed('No JSON found in LLM response');
    }

    return JSON.parse(jsonMatch[0]) as T;
  }

  private async generateBook(requestId: string, request: BookGenerationRequest, bookTypeId?: string): Promise<void> {
    const startTime = Date.now();
    const isFullBookMode = isGeneratedBookType(bookTypeId);
    const depthLevel = (request.depthLevel || 'standard') as 'brief' | 'standard' | 'deep';
    const useParallelGeneration = isFullBookMode && (depthLevel === 'standard' || depthLevel === 'deep');

    try {
      await this.bookRepository.updateStatus(requestId, 'processing');
      await this.bookRepository.updateProgress(requestId, {
        phase: 'outline',
        totalChapters: 0,
        completedChapters: 0,
        chapters: [],
      });

      const { systemPrompt, userPrompt } = await this.executeTemplate(requestId, request, bookTypeId);

      let generatedBook: GeneratedBookData;
      let providerMeta: Record<string, unknown>;

      if (useParallelGeneration) {
        logger.info('Using parallel chapter generation', { requestId, depthLevel });
        try {
          const result = await this.generateBookParallel(requestId, request, systemPrompt, userPrompt, depthLevel);
          generatedBook = result.book;
          providerMeta = result.providerMeta;
        } catch (parallelError) {
          const errorMsg = parallelError instanceof Error ? parallelError.message : String(parallelError);
          const isFatalError =
            errorMsg.includes('AI service returned') ||
            errorMsg.includes('Prompt template execution failed') ||
            errorMsg.includes('No subscription') ||
            errorMsg.includes('Validation');

          if (isFatalError) {
            throw parallelError;
          }

          logger.warn('Parallel generation failed, falling back to monolithic', {
            requestId,
            error: errorMsg,
          });
          const fallbackResult = await this.generateBookMonolithic(requestId, request, systemPrompt, userPrompt, depthLevel, true);
          generatedBook = fallbackResult.book;
          providerMeta = { ...fallbackResult.providerMeta, fallbackFromParallel: true };
        }
      } else {
        logger.info('Using monolithic generation', { requestId, depthLevel, isFullBookMode });
        const result = await this.generateBookMonolithic(requestId, request, systemPrompt, userPrompt, depthLevel, isFullBookMode);
        generatedBook = result.book;
        providerMeta = result.providerMeta;
      }

      generatedBook.chapters = generatedBook.chapters.map((chapter, idx) => ({
        ...chapter,
        order: chapter.order ?? idx,
        entries: Array.isArray(chapter.entries)
          ? chapter.entries.map(entry => ({
              ...entry,
              content: entry.content ? stripMarkdownFormatting(entry.content) : entry.content,
              prompt: entry.prompt ? stripMarkdownFormatting(entry.prompt) : entry.prompt,
            }))
          : [],
      }));

      const latencyMs = Date.now() - startTime;

      const isPartial = providerMeta.failedChapters && (providerMeta.failedChapters as number) > 0;
      const finalStatus = isPartial ? 'partial_success' : 'completed';

      await this.bookRepository.updateStatus(requestId, finalStatus, {
        generatedBook: { ...generatedBook, language: request.language || 'en-US' },
        usedSystemPrompt: systemPrompt,
        usedUserPrompt: userPrompt,
        providerMetadata: {
          latencyMs,
          bookTypeId: bookTypeId || undefined,
          parallelGeneration: useParallelGeneration,
          ...providerMeta,
        },
      });

      logger.info('Book generation completed', {
        requestId,
        latencyMs,
        chaptersGenerated: generatedBook.chapters.length,
        parallelGeneration: useParallelGeneration,
        partial: isPartial || false,
        status: finalStatus,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorStack = error instanceof Error ? error.stack : undefined;

      const isAbortError = errorName === 'AbortError' || errorMessage.includes('aborted');
      const enhancedMessage = isAbortError
        ? `Request timed out after extended wait (depth: ${request.depthLevel}, mode: ${request.generationMode}). The AI service may be overloaded.`
        : errorMessage;

      logger.error('Book generation failed', {
        requestId,
        error: errorMessage,
        errorName,
        errorStack: errorStack?.substring(0, 500),
        isAbortError,
        generationMode: request.generationMode,
        depthLevel: request.depthLevel,
        elapsedMs: Date.now() - startTime,
      });

      await this.bookRepository.updateStatus(requestId, 'failed', {
        errorMessage: enhancedMessage,
        providerMetadata: {
          latencyMs: Date.now() - startTime,
          error: errorMessage,
          errorName,
        },
      });
    }
  }

  private async executeTemplate(
    requestId: string,
    request: BookGenerationRequest,
    bookTypeId?: string
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    const isFullBookMode = isGeneratedBookType(bookTypeId);
    const promptTemplateId = await this.resolveTemplateId(bookTypeId);
    const depthLevel = (request.depthLevel || 'standard') as 'brief' | 'standard' | 'deep';
    const depthConfig = DEPTH_CONFIG[depthLevel];

    const aiConfigUrl = SERVICE_URLS.aiConfigService;
    const executeUrl = `${aiConfigUrl}/api/templates/execute`;

    logger.info('Calling AI config service for template execution', {
      requestId,
      promptTemplateId,
      generationMode: request.generationMode || 'blueprint',
      depthLevel,
    });

    const variables: Record<string, unknown> = {
      primary_goal: request.primaryGoal,
      language: request.language || 'en-US',
      tone: request.tone || 'supportive',
      cultural_profile: 'general',
    };

    if (isFullBookMode) {
      variables.min_entries = depthConfig.minEntries;
      variables.max_entries = depthConfig.maxEntries;
      variables.word_range = depthConfig.wordRange;
      variables.depth_level = depthLevel;
    }

    const response = await httpClient.postWithResponse(
      executeUrl,
      { templateId: promptTemplateId, variables },
      { timeout: 30000 }
    );

    if (!response.ok) {
      const errorData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      throw LibraryError.aiGenerationFailed(`AI service returned ${response.status}: ${errorData}`);
    }

    const result = (response.data && typeof response.data === 'object' ? response.data : {}) as Record<string, unknown>;
    if (!result.success) {
      throw LibraryError.aiGenerationFailed(typeof result.error === 'string' ? result.error : 'Prompt template execution failed');
    }

    const templateData = (typeof result.data === 'object' && result.data !== null ? result.data : result) as Record<string, unknown>;
    const rawPrompt = templateData.userPrompt || templateData.result;
    return {
      userPrompt: typeof rawPrompt === 'string' ? rawPrompt : String(rawPrompt || ''),
      systemPrompt: typeof templateData.systemPrompt === 'string' ? templateData.systemPrompt : '',
    };
  }

  private async invokeLlm(
    requestId: string,
    userPrompt: string,
    systemPrompt: string,
    maxTokens: number,
    timeoutMs: number,
    temperature = 0.7
  ): Promise<{ content: string; model: string; tokensUsed: number }> {
    const generationUrl = `${SERVICE_URLS.aiConfigService}/api/providers/invoke`;

    const llmResponse = await httpClient.postWithResponse(
      generationUrl,
      {
        operation: 'text_generation',
        payload: { userPrompt, systemPrompt, maxTokens, temperature },
        options: { timeout: timeoutMs, retries: 1, responseFormat: 'json' },
        metadata: { sourceService: 'user-service', timestamp: new Date().toISOString() },
      },
      { timeout: timeoutMs }
    );

    if (!llmResponse.ok) {
      const errorData = typeof llmResponse.data === 'string' ? llmResponse.data : JSON.stringify(llmResponse.data);
      throw LibraryError.aiGenerationFailed(`LLM generation failed: ${errorData}`);
    }

    const llmResult = (llmResponse.data && typeof llmResponse.data === 'object' ? llmResponse.data : {}) as Record<string, unknown>;
    if (!llmResult.success || !llmResult.data) {
      const errObj = typeof llmResult.error === 'object' && llmResult.error !== null ? llmResult.error as Record<string, unknown> : null;
      throw LibraryError.aiGenerationFailed(typeof errObj?.message === 'string' ? errObj.message : 'Provider invocation failed');
    }

    const llmData = (typeof llmResult.data === 'object' && llmResult.data !== null ? llmResult.data : {}) as Record<string, unknown>;
    const generatedContent = llmData.result || llmData.content || llmData.text;
    if (!generatedContent) {
      throw LibraryError.aiGenerationFailed('LLM returned empty response');
    }

    const contentString = typeof generatedContent === 'string' ? generatedContent : JSON.stringify(generatedContent);
    const usageObj = typeof llmData.usage === 'object' && llmData.usage !== null ? llmData.usage as Record<string, unknown> : null;

    return {
      content: contentString,
      model: typeof llmData.model === 'string' ? llmData.model : typeof llmData.providerId === 'string' ? llmData.providerId : 'unknown',
      tokensUsed: typeof usageObj?.totalTokens === 'number' ? usageObj.totalTokens : typeof llmData.tokensUsed === 'number' ? llmData.tokensUsed : 0,
    };
  }

  private async parseLlmJson<T>(
    contentString: string,
    requestId: string,
    maxRepairTokens: number,
    label: string
  ): Promise<T> {
    try {
      return this.extractJson(contentString, requestId) as T;
    } catch (parseError) {
      logger.warn(`${label}: initial JSON parse failed, attempting repair`, {
        requestId,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });

      const generationUrl = `${SERVICE_URLS.aiConfigService}/api/providers/invoke`;
      const repairResponse = await httpClient.postWithResponse(
        generationUrl,
        {
          operation: 'text_generation',
          payload: {
            userPrompt: `The following text is supposed to be valid JSON but has formatting errors. Fix it and return ONLY the corrected JSON object with no other text:\n\n${contentString.substring(0, 12000)}`,
            systemPrompt: 'You are a JSON repair tool. Return only valid JSON. Do not add explanations or markdown formatting.',
            maxTokens: maxRepairTokens,
            temperature: 0,
          },
          options: { timeout: 30000, retries: 0, responseFormat: 'json' },
          metadata: { sourceService: 'user-service', timestamp: new Date().toISOString() },
        },
        { timeout: 30000 }
      );

      const repairResult = repairResponse.data as Record<string, unknown>;
      if (repairResponse.ok && repairResult?.success && repairResult?.data) {
        const repairData = repairResult.data as Record<string, unknown>;
        const repairedContent = repairData.result || repairData.content || repairData.text;
        if (repairedContent) {
          const repairedString = typeof repairedContent === 'string' ? repairedContent : JSON.stringify(repairedContent);
          const result = this.extractJson(repairedString, requestId) as T;
          logger.info(`${label}: JSON repair succeeded`, { requestId });
          return result;
        }
      }

      throw LibraryError.aiGenerationFailed(`${label}: failed to parse JSON (repair also failed)`);
    }
  }

  private async generateBookMonolithic(
    requestId: string,
    request: BookGenerationRequest,
    systemPrompt: string,
    userPrompt: string,
    depthLevel: 'brief' | 'standard' | 'deep',
    isFullBookMode: boolean
  ): Promise<{ book: GeneratedBookData; providerMeta: Record<string, unknown> }> {
    const MAX_TOKENS_CONFIG = { brief: 4000, standard: 8000, deep: 16000 } as const;
    const maxTokens = isFullBookMode ? MAX_TOKENS_CONFIG[depthLevel] : 2000;
    const timeoutMs = isFullBookMode && depthLevel === 'deep' ? 180000 : 120000;

    await this.bookRepository.updateProgress(requestId, {
      phase: 'chapters',
      totalChapters: 0,
      completedChapters: 0,
      bookTitle: undefined,
      chapters: [],
    });

    const llmResult = await this.invokeLlm(requestId, userPrompt, systemPrompt, maxTokens, timeoutMs);

    const generatedBook = await this.parseLlmJson<GeneratedBookData>(
      llmResult.content,
      requestId,
      Math.min(maxTokens, 8000),
      'Monolithic generation'
    );

    if (!generatedBook.chapters || !Array.isArray(generatedBook.chapters)) {
      throw LibraryError.validationError('chapters', 'Invalid book structure: missing chapters array');
    }

    const chapterCount = generatedBook.chapters.length;
    await this.bookRepository.updateProgress(requestId, {
      phase: 'chapters',
      totalChapters: chapterCount,
      completedChapters: chapterCount,
      bookTitle: generatedBook.title,
      chapters: generatedBook.chapters.map(ch => ({
        title: ch.title || 'Chapter',
        status: 'completed' as const,
      })),
    });

    return {
      book: generatedBook,
      providerMeta: { model: llmResult.model, tokensUsed: llmResult.tokensUsed },
    };
  }

  private async generateBookParallel(
    requestId: string,
    request: BookGenerationRequest,
    systemPrompt: string,
    userPrompt: string,
    depthLevel: 'brief' | 'standard' | 'deep'
  ): Promise<{ book: GeneratedBookData; providerMeta: Record<string, unknown> }> {
    const depthConfig = DEPTH_CONFIG[depthLevel];
    const language = request.language || 'en-US';
    const tone = request.tone || 'supportive';

    const outlinePrompt = `${userPrompt}\n\nIMPORTANT: Generate ONLY the book outline structure. Return a JSON object with:\n- "title": the book title\n- "description": a 2-3 sentence book description\n- "category": a short category label (e.g. "growth", "anxiety", "relationships", "mindfulness", "purpose", "creativity")\n- "era": the cultural/historical era this content draws from (e.g. "Modern", "Contemporary", "Ancient", "Mixed")\n- "tradition": the philosophical or psychological tradition (e.g. "CBT", "Stoicism", "Mindfulness", "Positive Psychology", "Mixed")\n- "chapters": an array of chapter objects, each with "title", "description", and "order" (0-indexed). Do NOT include entries.\n\nTarget ${depthConfig.minEntries}-${depthConfig.maxEntries} entries total across all chapters. Create enough chapters to distribute that evenly (typically 3-6 chapters).`;

    logger.info('Phase 1: Generating book outline', { requestId, depthLevel });

    await this.bookRepository.updateProgress(requestId, {
      phase: 'outline',
      totalChapters: 0,
      completedChapters: 0,
      chapters: [],
    });

    const outlineResult = await this.invokeLlm(requestId, outlinePrompt, systemPrompt, 2000, 45000);

    interface BookOutline {
      title: string;
      description: string;
      category?: string;
      era?: string;
      tradition?: string;
      chapters: Array<{ title: string; description: string; order: number }>;
    }

    const outline = await this.parseLlmJson<BookOutline>(
      outlineResult.content,
      requestId,
      2000,
      'Outline generation'
    );

    if (!outline.chapters || !Array.isArray(outline.chapters) || outline.chapters.length === 0) {
      throw LibraryError.validationError('chapters', 'Outline generation produced no chapters');
    }

    outline.chapters = outline.chapters.map((ch, idx) => ({ ...ch, order: ch.order ?? idx }));

    const chapterCount = outline.chapters.length;
    const entriesPerChapter = Math.max(2, Math.ceil(depthConfig.maxEntries / chapterCount));
    const tokensPerChapter = depthLevel === 'deep' ? 4000 : 2500;
    const timeoutPerChapter = 60000;
    const maxConcurrency = 6;

    const chapterProgress = outline.chapters.map(ch => ({
      title: ch.title,
      status: 'pending' as 'pending' | 'generating' | 'completed' | 'failed',
    }));

    await this.bookRepository.updateProgress(requestId, {
      phase: 'chapters',
      totalChapters: chapterCount,
      completedChapters: 0,
      bookTitle: outline.title,
      chapters: chapterProgress,
    });

    logger.info('Phase 2: Generating chapters in parallel', {
      requestId,
      chapterCount,
      entriesPerChapter,
      maxConcurrency,
    });

    interface ChapterEntries {
      entries: Array<{ prompt: string; type: string; content?: string; sources?: Source[] }>;
    }

    interface ChapterResult {
      chapterIdx: number;
      entries: Array<{ prompt: string; type: string; content?: string; sources?: Source[] }>;
      model: string;
      tokensUsed: number;
      failed?: boolean;
    }

    let completedCount = 0;

    const chapterResults = await this.runWithConcurrency(
      outline.chapters.map((chapter, idx) => async (): Promise<ChapterResult> => {
        const chapterPrompt = `You are generating content for Chapter ${idx + 1} of a book titled "${outline.title}".\n\nBook description: ${outline.description}\nChapter title: "${chapter.title}"\nChapter description: ${chapter.description}\nLanguage: ${language}\nTone: ${tone}\nDepth: ${depthLevel}\nWord range per entry: ${depthConfig.wordRange}\n\nGenerate exactly ${entriesPerChapter} entries for this chapter. Return a JSON object with:\n- "entries": an array of entry objects, each with "prompt" (the topic/question), "type" (one of: "reflection", "exercise", "insight", "narrative", "lesson"), "content" (the detailed content, ${depthConfig.wordRange} words), and optionally "sources" (array of {author, work, era, tradition}).`;

        const chapterSystemPrompt = `You are an expert book author. Generate high-quality, detailed chapter content. Write in ${language} with a ${tone} tone. Return only valid JSON.`;

        chapterProgress[idx].status = 'generating';
        await this.bookRepository.updateProgress(requestId, {
          phase: 'chapters',
          totalChapters: chapterCount,
          completedChapters: completedCount,
          bookTitle: outline.title,
          chapters: chapterProgress,
        });

        try {
          const result = await this.invokeLlm(
            requestId,
            chapterPrompt,
            chapterSystemPrompt,
            tokensPerChapter,
            timeoutPerChapter,
            0.7
          );

          const parsed = await this.parseLlmJson<ChapterEntries>(
            result.content,
            requestId,
            tokensPerChapter,
            `Chapter ${idx + 1}`
          );

          chapterProgress[idx].status = 'completed';
          completedCount++;
          await this.bookRepository.updateProgress(requestId, {
            phase: 'chapters',
            totalChapters: chapterCount,
            completedChapters: completedCount,
            bookTitle: outline.title,
            chapters: chapterProgress,
          });

          return {
            chapterIdx: idx,
            entries: parsed.entries || [],
            model: result.model,
            tokensUsed: result.tokensUsed,
          };
        } catch (firstError) {
          logger.warn(`Chapter ${idx + 1} failed on first attempt, retrying`, {
            requestId,
            error: firstError instanceof Error ? firstError.message : String(firstError),
          });

          try {
            const retryResult = await this.invokeLlm(
              requestId,
              chapterPrompt,
              chapterSystemPrompt,
              tokensPerChapter,
              timeoutPerChapter,
              0.5
            );

            const retryParsed = await this.parseLlmJson<ChapterEntries>(
              retryResult.content,
              requestId,
              tokensPerChapter,
              `Chapter ${idx + 1} retry`
            );

            chapterProgress[idx].status = 'completed';
            completedCount++;
            await this.bookRepository.updateProgress(requestId, {
              phase: 'chapters',
              totalChapters: chapterCount,
              completedChapters: completedCount,
              bookTitle: outline.title,
              chapters: chapterProgress,
            });

            return {
              chapterIdx: idx,
              entries: retryParsed.entries || [],
              model: retryResult.model,
              tokensUsed: retryResult.tokensUsed,
            };
          } catch (retryError) {
            logger.error(`Chapter ${idx + 1} failed after retry`, {
              requestId,
              error: retryError instanceof Error ? retryError.message : String(retryError),
            });

            chapterProgress[idx].status = 'failed';
            await this.bookRepository.updateProgress(requestId, {
              phase: 'chapters',
              totalChapters: chapterCount,
              completedChapters: completedCount,
              bookTitle: outline.title,
              chapters: chapterProgress,
            });

            return {
              chapterIdx: idx,
              entries: [],
              model: 'unknown',
              tokensUsed: 0,
              failed: true,
            };
          }
        }
      }),
      maxConcurrency
    );

    const failedChapters = chapterResults.filter(r => r.failed);
    const successfulChapters = chapterResults.filter(r => !r.failed);

    if (successfulChapters.length === 0) {
      throw LibraryError.aiGenerationFailed(
        `All ${chapterCount} chapters failed to generate. Please try again.`
      );
    }

    const totalTokens = outlineResult.tokensUsed + chapterResults.reduce((sum, r) => sum + r.tokensUsed, 0);

    const assembledBook: GeneratedBookData = {
      title: outline.title,
      description: outline.description,
      category: outline.category,
      era: outline.era,
      tradition: outline.tradition,
      chapters: outline.chapters
        .map((chapter, idx) => {
          const chapterResult = chapterResults.find(r => r.chapterIdx === idx);
          if (chapterResult?.failed) return null;
          return {
            title: chapter.title,
            description: chapter.description,
            order: chapter.order,
            entries: chapterResult?.entries || [],
          };
        })
        .filter((ch): ch is NonNullable<typeof ch> => ch !== null),
    };

    if (failedChapters.length > 0) {
      logger.warn('Partial book generation: some chapters failed', {
        requestId,
        totalChapters: chapterCount,
        failedCount: failedChapters.length,
        failedIndices: failedChapters.map(r => r.chapterIdx),
      });
    }

    return {
      book: assembledBook,
      providerMeta: {
        model: successfulChapters[0]?.model || outlineResult.model,
        tokensUsed: totalTokens,
        outlineTokens: outlineResult.tokensUsed,
        chapterCount: successfulChapters.length,
        totalPlannedChapters: chapterCount,
        failedChapters: failedChapters.length,
        partialGeneration: failedChapters.length > 0,
        strategy: 'parallel',
      },
    };
  }

  private async runWithConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    maxConcurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const p: Promise<void> = task()
        .then(result => {
          results[i] = result;
        })
        .finally(() => {
          executing.delete(p);
        });
      executing.add(p);

      if (executing.size >= maxConcurrency) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
