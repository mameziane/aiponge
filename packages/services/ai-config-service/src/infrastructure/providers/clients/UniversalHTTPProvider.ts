/**
 * Universal HTTP Provider - Handles all AI services via database-driven HTTP templates
 * This single class replaces all hardcoded provider implementations
 */

import { TemplateEngine } from '../services/TemplateEngine';
import { logAndTrackError, publishProviderUsage, errorMessage } from '@aiponge/platform-core';
import { getLogger } from '@config/service-urls';
import { ConfigError } from '../../../application/errors';

const SERVICE_NAME = 'ai-config-service';

export interface ProviderTemplate {
  id: string;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  requestTemplate: Record<string, unknown>;
  responseMapping: Record<string, string>;
  errorMapping?: Record<string, string>;
  isActive: boolean;
  cost: number;
  timeout?: number;
  models?: string[]; // Optional array of supported models (for providers that use model in URL/request)
  providerId?: string; // Optional provider ID (for template lookup)
  healthEndpoint?: {
    url: string;
    method: 'GET' | 'HEAD';
    requiresAuth: boolean;
    isFree: boolean;
  };
}

export interface AIRequest {
  prompt: string;
  modality: 'text' | 'image' | 'music' | 'audio';
  options?: Record<string, unknown>;
  /** Image URL for Vision API analysis - when present, builds content array format */
  artworkUrl?: string;
  /** System prompt for chat completions */
  systemPrompt?: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  cost: number;
  responseTime: number;
  metadata?: Record<string, unknown>;
}

const PROVIDER_TIMEOUT_DEFAULTS: Record<string, number> = {
  openai: 60000,
  anthropic: 60000,
  elevenlabs: 90000,
  musicapi: 120000,
  'stability-ai': 60000,
};

export class UniversalHTTPProvider {
  private templateEngine: TemplateEngine;

  constructor() {
    this.templateEngine = new TemplateEngine();
  }

  private static readonly TRANSIENT_HTTP_CODES = [502, 503, 504];
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BASE_DELAY_MS = 1000;

  /**
   * Make AI request using database-driven provider template
   * SECURITY: authCredentials are applied as HTTP headers only, never in request body
   * Automatically retries on transient 5xx errors (502, 503, 504) with exponential backoff.
   */
  async makeRequest(
    template: ProviderTemplate,
    request: AIRequest,
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> },
    options?: { suppressLogging?: boolean }
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const logger = getLogger('ai-config-universal-http-provider');

    for (let attempt = 0; attempt <= UniversalHTTPProvider.MAX_RETRIES; attempt++) {
      try {
        const { content, responseData, response, responseTime } = await this.executeHTTPRequest(
          template,
          request,
          authCredentials
        );

        this.trackSuccessfulUsage(template, request, responseData, responseTime);

        const responseFormat = (template.responseMapping as Record<string, string>)?.format || 'text';
        const isBase64Response = responseFormat === 'base64';

        return {
          content,
          provider: template.name,
          cost: template.cost,
          responseTime,
          metadata: {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            responseFormat,
            isBase64: isBase64Response,
          },
        };
      } catch (error) {
        const msg = errorMessage(error);
        const statusMatch = msg.match(/HTTP\s+(\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
        const isTransient = statusCode !== null && UniversalHTTPProvider.TRANSIENT_HTTP_CODES.includes(statusCode);

        if (isTransient && attempt < UniversalHTTPProvider.MAX_RETRIES) {
          const delayMs = UniversalHTTPProvider.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn('Transient HTTP error from AI provider, retrying', {
            provider: template.name,
            statusCode,
            attempt: attempt + 1,
            maxRetries: UniversalHTTPProvider.MAX_RETRIES,
            delayMs,
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        return this.handleRequestError(error, template, request, startTime, options);
      }
    }

    return this.handleRequestError(
      new Error(`Max retries (${UniversalHTTPProvider.MAX_RETRIES}) exceeded for ${template.name}`),
      template,
      request,
      startTime,
      options
    );
  }

  private async executeHTTPRequest(
    template: ProviderTemplate,
    request: AIRequest,
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> }
  ): Promise<{ content: string; responseData: Record<string, unknown>; response: Response; responseTime: number }> {
    const startTime = Date.now();

    // Build request using template engine
    const { url, options: requestOptions } = this.buildHTTPRequest(template, request, authCredentials);

    // DEBUG: Log request details for OpenAI errors (development only)
    if (process.env.NODE_ENV !== 'production' && template.name === 'openai') {
      const logger = getLogger('ai-config-universal-http-provider');
      logger.debug('🔍 OpenAI Request Details:', {
        url,
        method: requestOptions.method,
        body: requestOptions.body,
        promptLength: request.prompt?.length || 0,
        modality: request.modality,
        options: request.options,
      });
    }

    // Resolve timeout: template config > env var override > provider-specific default > global fallback
    const providerEnvKey = `${template.name.toUpperCase().replace(/-/g, '_')}_TIMEOUT_MS`;
    const timeoutMs =
      template.timeout ||
      parseInt(process.env[providerEnvKey] || '0') ||
      0 ||
      PROVIDER_TIMEOUT_DEFAULTS[template.name.toLowerCase()] ||
      parseInt(process.env.AI_REQUEST_TIMEOUT || '90000');

    // Make HTTP request with explicit timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw ConfigError.providerInvocationFailed(template.name, `Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unable to read error response');
      throw ConfigError.providerInvocationFailed(
        template.name,
        `HTTP ${response.status}: ${response.statusText} - ${errorBody}`
      );
    }

    const responseData = (await response.json()) as Record<string, unknown>;

    // Parse response using template mapping
    const content = this.extractContent(responseData, template.responseMapping);
    const responseTime = Date.now() - startTime;

    this.logContentExtraction(template, content, responseData);
    this.validateExtractedContent(template, content, responseData, responseTime);

    return { content, responseData, response, responseTime };
  }

  private logContentExtraction(
    template: ProviderTemplate,
    content: string,
    responseData: Record<string, unknown>
  ): void {
    // Log content extraction for debugging (debug level to reduce noise)
    const logger = getLogger('ai-config-universal-http-provider');
    if (template.name === 'openai') {
      logger.debug(`[OpenAI] Content extraction result:`, {
        hasContent: !!content,
        contentLength: content?.length || 0,
        contentPreview: content?.substring(0, 150) || '<<<EMPTY>>>',
        responseDataKeys: Object.keys(responseData),
        choicesLength: (responseData.choices as unknown[] | undefined)?.length || 0,
        firstChoice: (responseData.choices as unknown[] | undefined)?.[0],
        mappingPath: template.responseMapping?.content || 'NO_MAPPING',
      });
    }
  }

  private validateExtractedContent(
    template: ProviderTemplate,
    content: string,
    responseData: Record<string, unknown>,
    responseTime: number
  ): void {
    // CRITICAL: Fail if content extraction returns empty - don't silently return empty success
    // Whitelist known structured responses: '{}', '[]', or any valid JSON object/array
    const isEmptyContent = content === undefined || content === null || content.trim().length === 0;
    const isValidStructuredResponse =
      content &&
      (content.trim() === '{}' ||
        content.trim() === '[]' ||
        (content.trim().startsWith('{') && content.trim().endsWith('}')) ||
        (content.trim().startsWith('[') && content.trim().endsWith(']')));

    if (isEmptyContent && !isValidStructuredResponse) {
      const logger = getLogger('ai-config-universal-http-provider');
      logger.error('AI provider returned empty content', {
        provider: template.name,
        responseDataKeys: Object.keys(responseData),
        responseTime,
        contentValue: content,
      });
      throw ConfigError.providerInvocationFailed(
        template.name,
        'returned empty content - check API response format or provider status'
      );
    }
  }

  private trackSuccessfulUsage(
    template: ProviderTemplate,
    request: AIRequest,
    responseData: Record<string, unknown>,
    responseTime: number
  ): void {
    // Track successful provider usage for analytics
    try {
      const tokensUsed = this.extractTokenUsage(responseData);
      publishProviderUsage(SERVICE_NAME, {
        providerId: template.id,
        providerName: template.name,
        operation: request.modality,
        success: true,
        durationMs: responseTime,
        tokensUsed: tokensUsed.total,
        cost: template.cost,
      });
    } catch (analyticsError) {
      // Non-blocking - don't fail request if analytics fails
    }
  }

  private handleRequestError(
    error: unknown,
    template: ProviderTemplate,
    request: AIRequest,
    startTime: number,
    options?: { suppressLogging?: boolean }
  ): never {
    const responseTime = Date.now() - startTime;
    const originalMessage = errorMessage(error);

    // Extract HTTP status code from error message
    const statusMatch = originalMessage.match(/HTTP\s+(\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;

    this.trackFailedUsage(template, request, responseTime, originalMessage);

    // If suppressLogging is enabled and status is "healthy error" (400/422/429), skip logging
    if (options?.suppressLogging && statusCode && [400, 422, 429].includes(statusCode)) {
      // Rethrow original error without logging (auth works, just bad test payload)
      throw error;
    }

    // Include original error message (which contains HTTP status) in wrapped error
    // This allows health checks to detect 400/422 as "auth successful"
    const { error: wrappedError, correlationId } = logAndTrackError(
      error,
      `AI provider request failed - ${template.name} is unavailable (${originalMessage})`,
      {
        provider: template.name,
        endpoint: template.endpoint.replace(/\/\/.*@/, '//***@'), // Hide credentials
        method: template.method,
        modality: request.modality,
        responseTime,
        timeout: template.timeout,
        promptLength: request.prompt?.length || 0,
      },
      'AI_PROVIDER_REQUEST_FAILURE',
      502 // Bad gateway - external AI service failure
    );

    throw wrappedError;
  }

  private trackFailedUsage(
    template: ProviderTemplate,
    request: AIRequest,
    responseTime: number,
    errorMessage: string
  ): void {
    // Track failed provider usage for analytics
    try {
      publishProviderUsage(SERVICE_NAME, {
        providerId: template.id,
        providerName: template.name,
        operation: request.modality,
        success: false,
        durationMs: responseTime,
        error: errorMessage,
      });
    } catch (analyticsError) {
      // Non-blocking - don't fail request if analytics fails
    }
  }

  /**
   * Build HTTP request from template and user input
   * SECURITY: Credentials are applied as headers or query params
   *
   * Special handling for Vision API:
   * When artworkUrl is present, builds OpenAI Vision message format with content arrays
   */
  private buildHTTPRequest(
    template: ProviderTemplate,
    request: AIRequest,
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> }
  ): { url: string; options: RequestInit } {
    // Check if this is a Vision API request (image analysis)
    const isVisionRequest = !!request.artworkUrl || !!request.options?.artworkUrl;

    // Build context for template resolution (NO SECRETS here)
    const context = {
      prompt: request.prompt,
      modality: request.modality,
      ...request.options,
    };

    // Process URL template
    let url = this.templateEngine.render(template.endpoint, context);

    // Append query parameters from auth if present
    if (authCredentials?.auth) {
      const urlObj = new URL(url);
      for (const [key, value] of Object.entries(authCredentials.auth)) {
        urlObj.searchParams.set(key, value);
      }
      url = urlObj.toString();
    }

    // Process headers template
    const templateHeaders = this.processTemplate(template.headers, context);

    // Merge template headers with auth credentials (SECURE: auth headers override template)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(templateHeaders as Record<string, string>),
      ...(authCredentials?.headers || {}), // Auth headers take precedence
    };

    // Process request body - special handling for Vision API
    let body: string | undefined;

    if (template.method !== 'GET') {
      if (isVisionRequest) {
        // Build Vision API specific message format with content arrays
        body = JSON.stringify(this.buildVisionRequestBody(request, context));
      } else {
        // Process request body template (NO SECRETS in body)
        body = JSON.stringify(this.processTemplate(template.requestTemplate, context));
      }
    }

    return {
      url,
      options: {
        method: template.method,
        headers,
        body,
      },
    };
  }

  /**
   * Build Vision API request body with proper content array format
   * OpenAI Vision requires messages with content arrays containing text and image_url parts
   */
  private buildVisionRequestBody(request: AIRequest, context: Record<string, unknown>): Record<string, unknown> {
    const artworkUrl = request.artworkUrl || request.options?.artworkUrl;
    const model = (request.options?.model as string) || (context.model as string) || 'gpt-4o';
    const maxTokens = (request.options?.max_tokens as number) || 1000;

    // Build messages array with Vision-compatible format
    const messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }>;
    }> = [];

    // Add system message if provided
    if (request.systemPrompt || request.options?.systemPrompt) {
      messages.push({
        role: 'system',
        content: (request.systemPrompt || request.options?.systemPrompt) as string,
      });
    }

    // Build user message with content array (text + image_url)
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
      { type: 'text', text: request.prompt },
    ];

    // Add image URL with appropriate detail level
    if (artworkUrl) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: artworkUrl as string,
          detail: ((request.options?.imageDetail as string) || 'low') as string, // 'low' for cost efficiency
        },
      });
    }

    messages.push({
      role: 'user',
      content: userContent,
    });

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
    };

    // Add response_format if JSON mode is requested
    if (request.options?.responseFormat === 'json' || request.options?.response_format) {
      requestBody.response_format = request.options?.response_format || { type: 'json_object' };
    }

    return requestBody;
  }

  /**
   * Process template object/array by resolving all template strings
   * CRITICAL: Preserves arrays vs objects to avoid breaking OpenAI API format
   */
  private processTemplate(template: unknown, context: Record<string, unknown>): unknown {
    // Handle arrays (e.g., messages array for OpenAI)
    if (Array.isArray(template)) {
      return template.map(item => {
        if (typeof item === 'string') {
          return this.templateEngine.render(item, context);
        } else if (typeof item === 'object' && item !== null) {
          return this.processTemplate(item, context);
        } else {
          return item;
        }
      });
    }

    // Handle objects
    if (typeof template === 'object' && template !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(template)) {
        if (typeof value === 'string') {
          result[key] = this.templateEngine.render(value, context);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.processTemplate(value, context);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    // Handle primitives
    return template;
  }

  /**
   * Extract content from response using mapping rules
   * Supports different response formats: text (content), image (artworkUrl), audio (audioUrl)
   */
  private extractContent(responseData: Record<string, unknown>, mapping: Record<string, string>): string {
    // Primary content extraction - for text/chat completions
    if (mapping.content) {
      return this.extractNestedValue(responseData, mapping.content);
    }

    // Image generation response - DALL-E returns artworkUrl at data[0].url
    // Check for non-empty result to avoid triggering empty content error on mapping failures
    if (mapping.artworkUrl) {
      const artworkUrl = this.extractNestedValue(responseData, mapping.artworkUrl);
      if (artworkUrl && artworkUrl.trim().length > 0) {
        return artworkUrl;
      }
      // Fall through to check common patterns if artworkUrl extraction failed
    }

    // Audio generation response
    if (mapping.audioUrl) {
      const audioUrl = this.extractNestedValue(responseData, mapping.audioUrl);
      if (audioUrl && audioUrl.trim().length > 0) {
        return audioUrl;
      }
      // Fall through to check common patterns if audioUrl extraction failed
    }

    return this.extractContentFallback(responseData);
  }

  private extractContentFallback(responseData: Record<string, unknown>): string {
    const data = responseData as Record<string, unknown> & {
      choices?: Array<{ message?: { content?: string } }>;
      content?: string;
      text?: string;
      output?: string;
      data?: Array<{ url?: string }>;
    };

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    if (data.content) {
      return data.content;
    }

    if (data.text) {
      return data.text;
    }

    if (data.output) {
      return data.output;
    }

    if (data.data?.[0]?.url) {
      return data.data[0].url;
    }

    return JSON.stringify(responseData);
  }

  /**
   * Extract nested value using dot notation and array bracket notation
   * Supports paths like: "choices[0].message.content"
   */
  private extractNestedValue(obj: unknown, path: string): string {
    let current: unknown = obj;

    // Split by dots but preserve array brackets
    const parts = path.split('.');

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return '';
      }

      // Check if part has array bracket notation (e.g., "choices[0]")
      const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
      const currentObj = current as Record<string, unknown>;

      if (arrayMatch) {
        // Extract array name and index
        const arrayName = arrayMatch[1];
        const index = parseInt(arrayMatch[2]);

        // Access array and then the index
        if (arrayName in currentObj && Array.isArray(currentObj[arrayName])) {
          current = (currentObj[arrayName] as unknown[])[index];
        } else {
          return '';
        }
      } else {
        // Regular property access
        if (part in currentObj) {
          current = currentObj[part];
        } else {
          return '';
        }
      }
    }

    return String(current);
  }

  /**
   * Create timeout signal for request
   */
  private createTimeoutSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller.signal;
  }

  /**
   * Extract token usage from AI provider response
   * Supports OpenAI, Anthropic, and other common formats
   */
  private extractTokenUsage(responseData: Record<string, unknown>): { input: number; output: number; total: number } {
    const usage = responseData.usage as
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          input_tokens?: number;
          output_tokens?: number;
        }
      | undefined;

    if (usage?.prompt_tokens !== undefined) {
      return {
        input: usage.prompt_tokens || 0,
        output: usage.completion_tokens || 0,
        total: usage.total_tokens || 0,
      };
    }

    if (usage?.input_tokens !== undefined) {
      return {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      };
    }

    return { input: 0, output: 0, total: 0 };
  }

  /**
   * Test connectivity to a provider endpoint
   * CRITICAL FIX: Use FREE health endpoints instead of making expensive API calls
   * Falls back to old behavior only if no health endpoint is configured
   */
  async testProvider(
    template: ProviderTemplate,
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> }
  ): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // CRITICAL: Check if provider has a FREE health endpoint
      const config = template as ProviderTemplate & {
        healthEndpoint?: { url: string; method: string; requiresAuth: boolean; isFree: boolean };
      };
      const healthEndpoint = config.healthEndpoint;

      if (healthEndpoint && healthEndpoint.isFree) {
        return await this.testViaHealthEndpoint(healthEndpoint, authCredentials, startTime);
      }

      return await this.testViaAPICall(template, authCredentials, startTime);
    } catch (error) {
      return this.interpretTestError(error, startTime);
    }
  }

  private async testViaHealthEndpoint(
    healthEndpoint: { url: string; method: string; requiresAuth: boolean; isFree: boolean },
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> },
    startTime: number = Date.now()
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    // Use FREE health endpoint (no API charges!)
    const headers: Record<string, string> = {};

    // Add auth if required
    if (healthEndpoint.requiresAuth && authCredentials?.headers) {
      Object.assign(headers, authCredentials.headers);
    }

    const response = await fetch(healthEndpoint.url, {
      method: healthEndpoint.method,
      headers,
      signal: this.createTimeoutSignal(5000), // 5 second timeout for health checks
    });

    if (response.ok) {
      return {
        success: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Treat certain status codes as "healthy"
    if (response.status === 429) {
      return {
        success: true,
        latencyMs: Date.now() - startTime,
        error: 'Rate limited but provider is responding',
      };
    }

    return {
      success: false,
      latencyMs: Date.now() - startTime,
      error: `Health check failed: HTTP ${response.status}`,
    };
  }

  private async testViaAPICall(
    template: ProviderTemplate,
    authCredentials?: { headers: Record<string, string>; auth?: Record<string, string> },
    startTime: number = Date.now()
  ): Promise<{ success: boolean; latencyMs: number; error?: string }> {
    // FALLBACK: No free health endpoint - make a test request (may cost money!)
    const testRequest: AIRequest = {
      prompt: 'test',
      modality: 'text',
      options: {
        model: (template as ProviderTemplate & { models?: string[] }).models?.[0] || 'default',
      },
    };

    await this.makeRequest(template, testRequest, authCredentials, { suppressLogging: true });

    return {
      success: true,
      latencyMs: Date.now() - startTime,
    };
  }

  private interpretTestError(
    error: unknown,
    startTime: number
  ): { success: boolean; latencyMs: number; error?: string } {
    const errMsg = errorMessage(error);
    const latencyMs = Date.now() - startTime;

    // HTTP 400/422 means auth worked but payload was invalid - this is still "healthy"
    // HTTP 401/403 means auth failed - this is unhealthy
    // HTTP 429 means rate limited - this is actually healthy (provider is responding)
    const isAuthSuccess = errMsg.includes('HTTP 400') || errMsg.includes('HTTP 422') || errMsg.includes('HTTP 429');

    if (isAuthSuccess) {
      return {
        success: true,
        latencyMs,
        error: `Auth OK, test payload rejected: ${errMsg}`,
      };
    }

    return {
      success: false,
      latencyMs,
      error: errMsg,
    };
  }
}
