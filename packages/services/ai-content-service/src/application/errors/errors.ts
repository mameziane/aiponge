import { DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';
import { VALID_IMAGE_TYPES } from '@aiponge/shared-contracts';

const ContentDomainCodes = {
  CONTENT_NOT_FOUND: 'CONTENT_CONTENT_NOT_FOUND',
  USER_ID_REQUIRED: 'CONTENT_USER_ID_REQUIRED',
  GENERATION_FAILED: 'CONTENT_GENERATION_FAILED',
  INVALID_CONTENT_TYPE: 'CONTENT_INVALID_TYPE',
  INVALID_QUALITY: 'CONTENT_INVALID_QUALITY',
  INSUFFICIENT_DATA: 'CONTENT_INSUFFICIENT_DATA',
  INVALID_STATE_TRANSITION: 'CONTENT_INVALID_STATE_TRANSITION',
} as const;

export const ContentErrorCode = { ...DomainErrorCode, ...ContentDomainCodes } as const;
export type ContentErrorCodeType = (typeof ContentErrorCode)[keyof typeof ContentErrorCode];

const ContentErrorBase = createDomainServiceError('Content', ContentErrorCode);

export class ContentError extends ContentErrorBase {
  static contentNotFound(contentId: string) {
    return new ContentError(`Content not found: ${contentId}`, 404, ContentErrorCode.CONTENT_NOT_FOUND);
  }

  static userIdRequired() {
    return new ContentError('User ID is required', 400, ContentErrorCode.USER_ID_REQUIRED);
  }

  static generationFailed(reason: string) {
    return new ContentError(`Content generation failed: ${reason}`, 500, ContentErrorCode.GENERATION_FAILED);
  }

  static invalidContentType(type: string) {
    return new ContentError(`Invalid content type: ${type}`, 400, ContentErrorCode.INVALID_CONTENT_TYPE);
  }

  static invalidQuality(reason: string) {
    return new ContentError(`Invalid content quality: ${reason}`, 400, ContentErrorCode.INVALID_QUALITY);
  }

  static insufficientData(reason: string) {
    return new ContentError(`Insufficient data: ${reason}`, 422, ContentErrorCode.INSUFFICIENT_DATA);
  }

  static invalidStateTransition(fromState: string, toState: string) {
    return new ContentError(
      `Cannot transition from '${fromState}' to '${toState}'`,
      422,
      ContentErrorCode.INVALID_STATE_TRANSITION
    );
  }
}

const ImageDomainCodes = {
  INVALID_TYPE: 'IMAGE_INVALID_TYPE',
  PROMPT_GENERATION_FAILED: 'IMAGE_PROMPT_GENERATION_FAILED',
  TEMPLATE_NOT_FOUND: 'IMAGE_TEMPLATE_NOT_FOUND',
  PROVIDER_FAILED: 'IMAGE_PROVIDER_FAILED',
  STORAGE_FAILED: 'IMAGE_STORAGE_FAILED',
  UPLOAD_FAILED: 'IMAGE_UPLOAD_FAILED',
  DOWNLOAD_FAILED: 'IMAGE_DOWNLOAD_FAILED',
  MISSING_CONTEXT: 'IMAGE_MISSING_CONTEXT',
  USER_ID_REQUIRED: 'IMAGE_USER_ID_REQUIRED',
  DIMENSIONS_INVALID: 'IMAGE_DIMENSIONS_INVALID',
  STYLE_INVALID: 'IMAGE_STYLE_INVALID',
  QUOTA_EXCEEDED: 'IMAGE_QUOTA_EXCEEDED',
} as const;

export const ImageErrorCode = { ...DomainErrorCode, ...ImageDomainCodes } as const;
export type ImageErrorCodeType = (typeof ImageErrorCode)[keyof typeof ImageErrorCode];

const ImageErrorBase = createDomainServiceError('Image', ImageErrorCode);

export class ImageError extends ImageErrorBase {
  static invalidImageType(type: string) {
    return new ImageError(
      `Invalid image type: ${type}. Expected: ${VALID_IMAGE_TYPES.join(', ')}`,
      400,
      ImageErrorCode.INVALID_TYPE
    );
  }

  static promptGenerationFailed(imageType: string, reason: string) {
    return new ImageError(
      `Failed to generate prompt for ${imageType}: ${reason}`,
      500,
      ImageErrorCode.PROMPT_GENERATION_FAILED
    );
  }

  static templateNotFound(templateName: string) {
    return new ImageError(`Image prompt template not found: ${templateName}`, 404, ImageErrorCode.TEMPLATE_NOT_FOUND);
  }

  static providerFailed(provider: string, reason: string, cause?: Error) {
    return new ImageError(
      `Image generation provider '${provider}' failed: ${reason}`,
      502,
      ImageErrorCode.PROVIDER_FAILED,
      cause
    );
  }

  static storageFailed(operation: string, reason: string, cause?: Error) {
    return new ImageError(`Image storage ${operation} failed: ${reason}`, 500, ImageErrorCode.STORAGE_FAILED, cause);
  }

  static uploadFailed(destinationPath: string, cause?: Error) {
    return new ImageError(`Failed to upload image to ${destinationPath}`, 500, ImageErrorCode.UPLOAD_FAILED, cause);
  }

  static downloadFailed(url: string, cause?: Error) {
    return new ImageError(
      `Failed to download image from provider URL: ${url}`,
      502,
      ImageErrorCode.DOWNLOAD_FAILED,
      cause
    );
  }

  static missingContext(field: string) {
    return new ImageError(
      `Missing required context for image generation: ${field}`,
      400,
      ImageErrorCode.MISSING_CONTEXT
    );
  }

  static userIdRequired() {
    return new ImageError('User ID is required for image generation', 400, ImageErrorCode.USER_ID_REQUIRED);
  }

  static dimensionsInvalid(width: number, height: number) {
    return new ImageError(`Invalid image dimensions: ${width}x${height}`, 400, ImageErrorCode.DIMENSIONS_INVALID);
  }

  static styleInvalid(style: string) {
    return new ImageError(`Invalid image style: ${style}`, 400, ImageErrorCode.STYLE_INVALID);
  }

  static quotaExceeded(userId: string) {
    return new ImageError(`Image generation quota exceeded for user: ${userId}`, 429, ImageErrorCode.QUOTA_EXCEEDED);
  }

  static timeout(operation: string, timeoutMs: number) {
    return new ImageError(`Image ${operation} timed out after ${timeoutMs}ms`, 504, ImageErrorCode.TIMEOUT);
  }
}

const ProviderDomainCodes = {
  UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  INVOCATION_FAILED: 'PROVIDER_INVOCATION_FAILED',
  RATE_LIMITED: 'PROVIDER_RATE_LIMITED',
  INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',
  CONFIGURATION_ERROR: 'PROVIDER_CONFIGURATION_ERROR',
} as const;

export const ProviderErrorCode = { ...DomainErrorCode, ...ProviderDomainCodes } as const;
export type ProviderErrorCodeType = (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];

const ProviderErrorBase = createDomainServiceError('Provider', ProviderErrorCode);

export class ProviderError extends ProviderErrorBase {
  static providerNotFound(providerId: string) {
    return new ProviderError(`Provider not found: ${providerId}`, 404, ProviderErrorCode.NOT_FOUND);
  }

  static providerUnavailable(providerId: string) {
    return new ProviderError(`Provider unavailable: ${providerId}`, 503, ProviderErrorCode.UNAVAILABLE);
  }

  static invocationFailed(reason: string) {
    return new ProviderError(`Provider invocation failed: ${reason}`, 500, ProviderErrorCode.INVOCATION_FAILED);
  }

  static rateLimited(providerId: string) {
    return new ProviderError(`Rate limited by provider: ${providerId}`, 429, ProviderErrorCode.RATE_LIMITED);
  }

  static timeout(providerId: string) {
    return new ProviderError(`Provider request timed out: ${providerId}`, 504, ProviderErrorCode.TIMEOUT);
  }

  static invalidResponse(reason: string) {
    return new ProviderError(`Invalid provider response: ${reason}`, 502, ProviderErrorCode.INVALID_RESPONSE);
  }

  static configurationError(reason: string) {
    return new ProviderError(`Provider configuration error: ${reason}`, 500, ProviderErrorCode.CONFIGURATION_ERROR);
  }
}

const TemplateDomainCodes = {
  DUPLICATE: 'TEMPLATE_DUPLICATE',
  INVALID_TYPE: 'TEMPLATE_INVALID_TYPE',
  RENDER_FAILED: 'TEMPLATE_RENDER_FAILED',
  EXECUTION_FAILED: 'TEMPLATE_EXECUTION_FAILED',
  COMPILATION_FAILED: 'TEMPLATE_COMPILATION_FAILED',
  MISSING_VARIABLES: 'TEMPLATE_MISSING_VARIABLES',
  DELETE_FAILED: 'TEMPLATE_DELETE_FAILED',
} as const;

export const TemplateErrorCode = { ...DomainErrorCode, ...TemplateDomainCodes } as const;
export type TemplateErrorCodeType = (typeof TemplateErrorCode)[keyof typeof TemplateErrorCode];

const TemplateErrorBase = createDomainServiceError('Template', TemplateErrorCode);

export class TemplateError extends TemplateErrorBase {
  static templateNotFound(templateId: string) {
    return new TemplateError(`Template not found: ${templateId}`, 404, TemplateErrorCode.NOT_FOUND);
  }

  static duplicateTemplate(templateId: string) {
    return new TemplateError(`Template already exists: ${templateId}`, 409, TemplateErrorCode.DUPLICATE);
  }

  static invalidTemplateType(type: string) {
    return new TemplateError(`Invalid template type: ${type}`, 400, TemplateErrorCode.INVALID_TYPE);
  }

  static renderFailed(reason: string) {
    return new TemplateError(`Template rendering failed: ${reason}`, 500, TemplateErrorCode.RENDER_FAILED);
  }

  static executionFailed(reason: string) {
    return new TemplateError(`Template execution failed: ${reason}`, 500, TemplateErrorCode.EXECUTION_FAILED);
  }

  static compilationFailed(reason: string) {
    return new TemplateError(`Template compilation failed: ${reason}`, 400, TemplateErrorCode.COMPILATION_FAILED);
  }

  static missingVariables(variables: string[]) {
    return new TemplateError(
      `Missing required template variables: ${variables.join(', ')}`,
      400,
      TemplateErrorCode.MISSING_VARIABLES
    );
  }

  static deleteFailed(templateId: string) {
    return new TemplateError(`Failed to delete template: ${templateId}`, 500, TemplateErrorCode.DELETE_FAILED);
  }
}
