/**
 * Content Service Client
 * Client for interacting with the AI Content Service
 */

import {
  type HttpClient,
  getServiceUrl,
  serializeError,
  withServiceResilience,
  DomainError,
} from '@aiponge/platform-core';
import { createServiceClient, getLogger } from '@config/service-urls';
import { v4 as uuidv4 } from 'uuid';

const SERVICE_NAME = 'ai-content-service';
const logger = getLogger('content-service-client');

function generateCorrelationId(): string {
  return `trace-${Date.now()}-${uuidv4().substring(0, 8)}`;
}

interface CorrelationContext {
  correlationId: string;
  service: string;
  operation?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

function createCorrelationContext(
  correlationId: string,
  service: string,
  options?: { operation?: string; userId?: string; metadata?: Record<string, unknown> }
): CorrelationContext {
  return {
    correlationId,
    service,
    operation: options?.operation,
    userId: options?.userId,
    metadata: options?.metadata,
  };
}

interface ServiceCallLog {
  target: string;
  targetOperation: string;
  duration: number;
  status: 'success' | 'error';
  statusCode?: number;
  error?: Error;
}

function logServiceCall(log: ReturnType<typeof getLogger>, context: CorrelationContext, call: ServiceCallLog): void {
  const logData = {
    correlationId: context.correlationId,
    service: context.service,
    operation: context.operation,
    target: call.target,
    targetOperation: call.targetOperation,
    duration: call.duration,
    status: call.status,
    statusCode: call.statusCode,
  };

  if (call.status === 'error') {
    log.error('Service call failed', { ...logData, error: call.error?.message });
  } else {
    log.info('Service call completed', logData);
  }
}

export interface ContentAnalysisOptions {
  language?: string;
  userId?: string;
  templateId?: string;
  [key: string]: unknown;
}

export interface ContentAnalysisRequest {
  content: string;
  type: string;
  userId?: string;
  options?: ContentAnalysisOptions;
}

export interface AnalysisResult {
  sentiment?: string;
  themes?: string[];
  patterns?: string[];
  insights?: string[];
  [key: string]: unknown;
}

export interface ContentAnalysisResponse {
  analysis: AnalysisResult;
  success: boolean;
  error?: string;
}

export interface TextAnalysisContext {
  userId?: string;
  language?: string;
  [key: string]: unknown;
}

export interface TextAnalysisRequest {
  text: string;
  content?: string;
  analysisType?: 'sentiment' | 'themes' | 'comprehensive';
  context?: TextAnalysisContext;
}

export interface TextAnalysisResponse {
  success: boolean;
  analysis?: AnalysisResult;
  error?: string;
}

export class ContentServiceClient {
  private httpClient: HttpClient;
  private static instance: ContentServiceClient | null = null;

  constructor() {
    const { httpClient } = createServiceClient('ai-content-service', { type: 'ai' });
    this.httpClient = httpClient;
  }

  /**
   * Get singleton instance to prevent duplicate client creation
   */
  static getInstance(): ContentServiceClient {
    if (!ContentServiceClient.instance) {
      ContentServiceClient.instance = new ContentServiceClient();
    }
    return ContentServiceClient.instance;
  }

  async analyzeContent(request: ContentAnalysisRequest, correlationId?: string): Promise<ContentAnalysisResponse> {
    const startTime = Date.now();
    const traceId = correlationId || generateCorrelationId();

    const context = createCorrelationContext(traceId, 'user-service', {
      operation: 'analyze-content',
      userId: request.userId,
      metadata: {
        contentType: request.type,
        contentLength: request.content?.length,
      },
    });

    return withServiceResilience(
      'ai-content-service',
      'analyzeContent',
      async () => {
        try {
          const textAnalysisRequest: TextAnalysisRequest = {
            text: request.content,
            content: request.content,
            analysisType: 'comprehensive',
            context: {
              userId: request.userId,
              ...request.options,
            },
          };

          const response = await this.httpClient.post(
            getServiceUrl(SERVICE_NAME) + '/api/ai/text/analyze',
            textAnalysisRequest,
            {
              headers: {
                'X-Correlation-Id': traceId,
                'X-User-Id': request.userId,
                'X-Operation': 'analyze-content',
              },
              timeout: 30000,
            }
          );

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/ai/text/analyze',
            duration: Date.now() - startTime,
            status: 'success',
            statusCode: 200,
          });

          const data = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
          return {
            success: data.success === true,
            analysis: (typeof data.analysis === 'object' && data.analysis !== null
              ? data.analysis
              : {}) as AnalysisResult,
            error: typeof data.error === 'string' ? data.error : undefined,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/ai/text/analyze',
            duration: Date.now() - startTime,
            status: 'error',
            statusCode: 500,
            error: new Error(errorMessage),
          });

          return {
            success: false,
            analysis: {},
            error: errorMessage,
          };
        }
      },
      'ai-provider'
    );
  }

  async generateInsights(
    content: string,
    options?: ContentAnalysisOptions,
    correlationId?: string
  ): Promise<{ insights: string[]; confidence: number }> {
    const startTime = Date.now();
    const traceId = correlationId || generateCorrelationId();

    const context = createCorrelationContext(traceId, 'user-service', {
      operation: 'generate-insights',
      metadata: {
        contentLength: content?.length,
        language: options?.language,
      },
    });

    return withServiceResilience(
      'ai-content-service',
      'generateInsights',
      async () => {
        try {
          // Use provided language code or default to English
          // Templates expect language names, so map common codes
          const langCode = options?.language || 'en';
          const targetLanguage = this.mapLanguageCodeToName(langCode);

          const request = {
            userId: options?.userId || 'unknown',
            contentType: 'technical',
            prompt: content,
            parameters: {
              language: targetLanguage,
              language_preference: targetLanguage,
              framework: 'CBT',
              analysis_focus: 'patterns and insights',
              analysis_depth: 'comprehensive',
              therapeutic_goal: 'personal growth and self-awareness',
              cultural_context: 'general',
              output_format: 'natural language insights',
            },
            options: {
              templateId: 'entry-analysis',
              ...options,
            },
          };

          const response = await this.httpClient.post(getServiceUrl(SERVICE_NAME) + '/api/content/generate', request, {
            headers: {
              'X-Correlation-Id': traceId,
              'X-Operation': 'generate-insights',
            },
            timeout: 30000,
          });

          logger.info('🔍 RAW HTTP RESPONSE STRUCTURE', {
            responseExists: !!response,
            responseType: typeof response,
            responseKeys: response ? Object.keys(response) : [],
            hasData: !!(response as Record<string, unknown>)?.data,
            dataType: typeof (response as Record<string, unknown>)?.data,
            // Try different possible locations
            directData: response
              ? typeof response === 'object'
                ? Object.keys(response).slice(0, 10)
                : 'not object'
              : 'no response',
          });

          // The response might be the data directly, not wrapped in .data
          const responseData = (response as Record<string, unknown>)?.data || response;

          const typedResponseData = responseData as Record<string, unknown>;
          logger.info('🔍 EXTRACTED RESPONSE DATA', {
            hasResponseData: !!responseData,
            responseDataType: typeof responseData,
            responseDataKeys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : [],
            hasSuccess: !!typedResponseData?.success,
            hasContent: !!typedResponseData?.content,
          });

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/content/generate',
            duration: Date.now() - startTime,
            status: 'success',
            statusCode: 200,
          });

          // Extract the actual text content from the Content entity
          if (!responseData || typeof responseData !== 'object') {
            logger.error('❌ INVALID RESPONSE STRUCTURE', {
              response,
              responseData,
              hasResponse: !!response,
              hasResponseData: !!responseData,
            });
            throw new DomainError('No response data from AI Content Service', 502);
          }

          logger.info('🔍 PARSING CONTENT FROM RESPONSE', {
            hasContent: !!typedResponseData.content,
            contentType: typeof typedResponseData.content,
            contentKeys:
              typedResponseData.content && typeof typedResponseData.content === 'object'
                ? Object.keys(typedResponseData.content as object)
                : [],
            success: typedResponseData.success,
          });

          // The response contains a Content entity with nested 'content' property
          const contentEntity = typedResponseData.content as Record<string, unknown> | string | null;
          let insightText = '';

          if (typeof contentEntity === 'string') {
            // If somehow the content is returned as a string directly
            insightText = contentEntity;
          } else if (contentEntity && typeof contentEntity === 'object') {
            // Content entity object has a 'content' property with the actual text
            // response.data.content.content - first .content is the entity, second is the text field
            insightText = String(contentEntity.content ?? contentEntity.text ?? contentEntity.generatedText ?? '');

            logger.info('🔍 EXTRACTING TEXT FROM CONTENT ENTITY', {
              hasContent: !!contentEntity.content,
              hasText: !!contentEntity.text,
              hasGeneratedText: !!contentEntity.generatedText,
              extractedLength: insightText?.length || 0,
              textPreview: insightText?.substring(0, 150) || 'NO TEXT',
            });
          } else {
            logger.error('❌ UNEXPECTED CONTENT ENTITY TYPE', {
              contentEntity,
              type: typeof contentEntity,
              isNull: contentEntity === null,
              isUndefined: contentEntity === undefined,
            });
          }

          logger.info('✅ Generated insight text successfully', {
            contentEntityType: typeof contentEntity,
            hasText: !!insightText,
            textLength: insightText?.length || 0,
            textPreview: insightText?.substring(0, 100) || 'NO TEXT',
          });

          if (!insightText || insightText.trim().length === 0) {
            throw new DomainError('AI Content Service returned empty insight text', 502);
          }

          const metadata = typedResponseData.metadata as Record<string, unknown> | undefined;
          return {
            insights: [insightText],
            confidence: typeof metadata?.confidence === 'number' ? metadata.confidence : 0.8,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : '';
          const errorWithResponse = error as { response?: { status?: number; data?: unknown } };
          const statusCode = errorWithResponse?.response?.status;

          // Detect connection/network errors (service unavailable)
          const isConnectionError =
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('socket hang up') ||
            errorMessage.includes('connect ECONNREFUSED');

          const userFriendlyMessage = isConnectionError
            ? 'AI content service is temporarily unavailable. Please try again in a few minutes.'
            : `Insight generation failed: ${errorMessage}`;

          logger.error('❌ INSIGHT GENERATION FAILED', {
            error: errorMessage,
            stack: errorStack,
            contentLength: content?.length,
            contentPreview: content?.substring(0, 100),
            response: errorWithResponse?.response?.data || 'No response data',
            statusCode,
            isConnectionError,
          });

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/content/generate',
            duration: Date.now() - startTime,
            status: 'error',
            statusCode: statusCode || 503,
            error: new Error(errorMessage),
          });

          throw new DomainError(userFriendlyMessage, 502);
        }
      },
      'ai-provider'
    );
  }

  async analyzeEntry(
    entryData: { content: string; userId?: string; entryId?: string },
    correlationId?: string
  ): Promise<{
    analysis: { sentiment: string; themes: string[]; emotions?: string[]; insights?: string[] };
    error?: string;
  }> {
    const startTime = Date.now();
    const traceId = correlationId || generateCorrelationId();

    const context = createCorrelationContext(traceId, 'user-service', {
      operation: 'analyze-entry',
      userId: entryData.userId,
      metadata: {
        entryId: entryData.entryId,
      },
    });

    return withServiceResilience(
      'ai-content-service',
      'analyzeEntry',
      async () => {
        try {
          const textAnalysisRequest: TextAnalysisRequest = {
            text: entryData.content,
            content: entryData.content,
            analysisType: 'comprehensive',
            context: {
              userId: entryData.userId,
              entryId: entryData.entryId,
            },
          };

          const response = await this.httpClient.post(
            getServiceUrl(SERVICE_NAME) + '/api/ai/text/analyze',
            textAnalysisRequest,
            {
              headers: {
                'X-Correlation-Id': traceId,
                'X-User-Id': entryData.userId as string,
                'X-Operation': 'analyze-entry',
              },
              timeout: 30000,
            }
          );

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/ai/text/analyze',
            duration: Date.now() - startTime,
            status: 'success',
            statusCode: 200,
          });

          const responseData = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
          const analysisData =
            typeof responseData.analysis === 'object' && responseData.analysis !== null
              ? (responseData.analysis as Record<string, unknown>)
              : undefined;
          return {
            analysis: {
              sentiment: typeof analysisData?.sentiment === 'string' ? analysisData.sentiment : 'neutral',
              themes: Array.isArray(analysisData?.themes)
                ? analysisData.themes.filter((t: unknown): t is string => typeof t === 'string')
                : [],
              emotions: Array.isArray(analysisData?.emotions)
                ? analysisData.emotions.filter((e: unknown): e is string => typeof e === 'string')
                : [],
              insights: Array.isArray(analysisData?.insights)
                ? analysisData.insights.filter((i: unknown): i is string => typeof i === 'string')
                : [],
            },
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          logServiceCall(logger, context, {
            target: SERVICE_NAME,
            targetOperation: '/api/ai/text/analyze',
            duration: Date.now() - startTime,
            status: 'error',
            statusCode: 500,
            error: new Error(errorMessage),
          });

          return {
            analysis: {
              sentiment: 'neutral',
              themes: [],
              emotions: [],
            },
            error: errorMessage,
          };
        }
      },
      'ai-provider'
    );
  }

  /**
   * Maps language codes (e.g., 'de-DE', 'en', 'es') to full language names for AI templates
   */
  private mapLanguageCodeToName(langCode: string): string {
    const languageMap: Record<string, string> = {
      en: 'English',
      'en-US': 'English',
      'en-GB': 'English',
      de: 'German',
      'de-DE': 'German',
      'de-AT': 'German',
      es: 'Spanish',
      'es-ES': 'Spanish',
      'es-MX': 'Spanish',
      fr: 'French',
      'fr-FR': 'French',
      pt: 'Portuguese',
      'pt-BR': 'Portuguese',
      'pt-PT': 'Portuguese',
      it: 'Italian',
      'it-IT': 'Italian',
      nl: 'Dutch',
      'nl-NL': 'Dutch',
      ar: 'Arabic',
      'ar-SA': 'Arabic',
      zh: 'Chinese',
      'zh-CN': 'Chinese',
      'zh-TW': 'Chinese',
      ja: 'Japanese',
      'ja-JP': 'Japanese',
      ko: 'Korean',
      'ko-KR': 'Korean',
      ru: 'Russian',
      'ru-RU': 'Russian',
    };

    // Return mapped name, or the original code if it's already a full name, or English as fallback
    return languageMap[langCode] || (langCode.length > 3 && !langCode.includes('-') ? langCode : 'English');
  }

  async healthCheck(correlationId?: string): Promise<boolean> {
    const traceId = correlationId || generateCorrelationId();

    try {
      const response = await this.httpClient.get(getServiceUrl(SERVICE_NAME) + '/health', {
        headers: {
          'X-Correlation-Id': traceId,
          'X-Operation': 'health-check',
        },
        timeout: 5000,
      });

      return (response as { status?: number }).status === 200;
    } catch (error) {
      logger.error('❌ Content service health check failed', {
        module: 'content_service_client',
        operation: 'health_check',
        error: serializeError(error),
        correlationId: traceId,
      });
      return false;
    }
  }
}
