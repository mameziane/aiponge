import { DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const AuthDomainCodes = {
  VALIDATION_ERROR: 'AUTH_VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  PASSWORD_REQUIREMENTS_NOT_MET: 'AUTH_PASSWORD_REQUIREMENTS_NOT_MET',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',
  PHONE_VERIFICATION_REQUIRED: 'AUTH_PHONE_VERIFICATION_REQUIRED',
  INTERNAL_ERROR: 'AUTH_INTERNAL_ERROR',
  NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  SERVICE_UNAVAILABLE: 'AUTH_INTERNAL_ERROR',
} as const;

export const AuthErrorCode = { ...DomainErrorCode, ...AuthDomainCodes } as const;
export type AuthErrorCodeType = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

const AuthErrorBase = createDomainServiceError('Auth', AuthErrorCode);

export class AuthError extends AuthErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: AuthErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new AuthError(`Validation failed for ${field}: ${message}`, 400, AuthErrorCode.VALIDATION_ERROR, undefined, {
      field,
    });
  }

  static invalidCredentials(message: string = 'Invalid credentials') {
    return new AuthError(message, 401, AuthErrorCode.INVALID_CREDENTIALS);
  }

  static invalidToken(message: string = 'Invalid or expired token') {
    return new AuthError(message, 401, AuthErrorCode.INVALID_TOKEN);
  }

  static userNotFound(identifier?: string) {
    return new AuthError(
      'User account not found',
      404,
      AuthErrorCode.USER_NOT_FOUND,
      undefined,
      identifier ? { identifier } : undefined
    );
  }

  static accountDisabled(message: string = 'Account has been disabled') {
    return new AuthError(message, 403, AuthErrorCode.ACCOUNT_DISABLED);
  }

  static passwordRequirementsNotMet(message: string = 'Password requirements not met') {
    return new AuthError(message, 400, AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET);
  }

  static unauthorized(message: string = 'Unauthorized access') {
    return new AuthError(message, 401, AuthErrorCode.UNAUTHORIZED);
  }

  static forbidden(message: string = 'Access forbidden') {
    return new AuthError(message, 403, AuthErrorCode.FORBIDDEN);
  }

  static phoneVerificationRequired(message: string = 'Phone verification required') {
    return new AuthError(message, 403, AuthErrorCode.PHONE_VERIFICATION_REQUIRED);
  }

  static internalError(message: string, error?: Error) {
    return new AuthError(message, 500, AuthErrorCode.INTERNAL_ERROR, undefined, { originalError: error?.message });
  }
}

const BillingDomainCodes = {
  VALIDATION_ERROR: 'BILLING_VALIDATION_ERROR',
  USER_ID_REQUIRED: 'BILLING_USER_ID_REQUIRED',
  INVALID_FEATURE_TYPE: 'BILLING_INVALID_FEATURE_TYPE',
  INVALID_ACTION_TYPE: 'BILLING_INVALID_ACTION_TYPE',
  INVALID_AMOUNT: 'BILLING_INVALID_AMOUNT',
  INSUFFICIENT_CREDITS: 'BILLING_INSUFFICIENT_CREDITS',
  QUOTA_EXCEEDED: 'BILLING_QUOTA_EXCEEDED',
  SUBSCRIPTION_REQUIRED: 'BILLING_SUBSCRIPTION_REQUIRED',
  NOT_FOUND: 'BILLING_NOT_FOUND',
  INTERNAL_ERROR: 'BILLING_INTERNAL_ERROR',
  UNAUTHORIZED: 'BILLING_VALIDATION_ERROR',
  FORBIDDEN: 'BILLING_VALIDATION_ERROR',
  SERVICE_UNAVAILABLE: 'BILLING_INTERNAL_ERROR',
} as const;

export const BillingErrorCode = { ...DomainErrorCode, ...BillingDomainCodes } as const;
export type BillingErrorCodeType = (typeof BillingErrorCode)[keyof typeof BillingErrorCode];

const BillingErrorBase = createDomainServiceError('Billing', BillingErrorCode);

export class BillingError extends BillingErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: BillingErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new BillingError(
      `Validation failed for ${field}: ${message}`,
      400,
      BillingErrorCode.VALIDATION_ERROR,
      undefined,
      { field }
    );
  }

  static userIdRequired() {
    return new BillingError('User ID is required', 400, BillingErrorCode.USER_ID_REQUIRED);
  }

  static invalidFeatureType(featureType?: string) {
    return new BillingError('Invalid feature type', 400, BillingErrorCode.INVALID_FEATURE_TYPE, undefined, {
      featureType,
    });
  }

  static invalidActionType(actionType?: string) {
    return new BillingError('Invalid action type', 400, BillingErrorCode.INVALID_ACTION_TYPE, undefined, {
      actionType,
    });
  }

  static invalidAmount(message: string = 'Amount must be greater than zero') {
    return new BillingError(message, 400, BillingErrorCode.INVALID_AMOUNT);
  }

  static insufficientCredits(required: number, available: number) {
    return new BillingError('Insufficient credits', 402, BillingErrorCode.INSUFFICIENT_CREDITS, undefined, {
      required,
      available,
    });
  }

  static quotaExceeded(feature: string, limit: number) {
    return new BillingError(`Quota exceeded for ${feature}`, 429, BillingErrorCode.QUOTA_EXCEEDED, undefined, {
      feature,
      limit,
    });
  }

  static subscriptionRequired(message: string = 'Subscription required') {
    return new BillingError(message, 402, BillingErrorCode.SUBSCRIPTION_REQUIRED);
  }

  static notFound(resource: string, id: string) {
    return new BillingError(`${resource} not found`, 404, BillingErrorCode.NOT_FOUND, undefined, { resource, id });
  }

  static internalError(message: string, error?: Error) {
    return new BillingError(message, 500, BillingErrorCode.INTERNAL_ERROR, undefined, {
      originalError: error?.message,
    });
  }
}

const ProfileDomainCodes = {
  VALIDATION_ERROR: 'PROFILE_VALIDATION_ERROR',
  USER_ID_REQUIRED: 'PROFILE_USER_ID_REQUIRED',
  NOT_FOUND: 'PROFILE_NOT_FOUND',
  INVALID_DEPTH: 'PROFILE_INVALID_DEPTH',
  INVALID_DATE_RANGE: 'PROFILE_INVALID_DATE_RANGE',
  INSUFFICIENT_DATA: 'PROFILE_INSUFFICIENT_DATA',
  INVALID_FORMAT: 'PROFILE_INVALID_FORMAT',
  BUSINESS_RULE_VIOLATION: 'PROFILE_BUSINESS_RULE_VIOLATION',
  UNAUTHORIZED: 'PROFILE_UNAUTHORIZED',
  FORBIDDEN: 'PROFILE_FORBIDDEN',
  INTERNAL_ERROR: 'PROFILE_INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'PROFILE_INTERNAL_ERROR',
} as const;

export const ProfileErrorCode = { ...DomainErrorCode, ...ProfileDomainCodes } as const;
export type ProfileErrorCodeType = (typeof ProfileErrorCode)[keyof typeof ProfileErrorCode];

const ProfileErrorBase = createDomainServiceError('Profile', ProfileErrorCode);

export class ProfileError extends ProfileErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: ProfileErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new ProfileError(
      `Validation failed for ${field}: ${message}`,
      400,
      ProfileErrorCode.VALIDATION_ERROR,
      undefined,
      { field }
    );
  }

  static userIdRequired() {
    return new ProfileError('User ID is required', 400, ProfileErrorCode.USER_ID_REQUIRED);
  }

  static notFound(resource: string, id: string) {
    return new ProfileError(`${resource} with id ${id} not found`, 404, ProfileErrorCode.NOT_FOUND, undefined, {
      resource,
      id,
    });
  }

  static invalidDepth(depth?: string) {
    return new ProfileError('Invalid analysis depth', 400, ProfileErrorCode.INVALID_DEPTH, undefined, { depth });
  }

  static invalidDateRange(message: string = 'Start date must be before end date') {
    return new ProfileError(message, 400, ProfileErrorCode.INVALID_DATE_RANGE);
  }

  static insufficientData(message: string, minRequired?: number) {
    return new ProfileError(
      message,
      422,
      ProfileErrorCode.INSUFFICIENT_DATA,
      undefined,
      minRequired ? { minRequired } : undefined
    );
  }

  static invalidFormat(format?: string) {
    return new ProfileError(`Invalid format: ${format}`, 400, ProfileErrorCode.INVALID_FORMAT, undefined, { format });
  }

  static businessRuleViolation(message: string) {
    return new ProfileError(message, 422, ProfileErrorCode.BUSINESS_RULE_VIOLATION);
  }

  static unauthorized(message: string = 'Unauthorized access') {
    return new ProfileError(message, 401, ProfileErrorCode.UNAUTHORIZED);
  }

  static forbidden(message: string = 'Access forbidden') {
    return new ProfileError(message, 403, ProfileErrorCode.FORBIDDEN);
  }

  static internalError(message: string, error?: Error) {
    return new ProfileError(message, 500, ProfileErrorCode.INTERNAL_ERROR, undefined, {
      originalError: error?.message,
      stack: error?.stack,
    });
  }
}

const UserLibraryDomainCodes = {
  VALIDATION_ERROR: 'USER_LIBRARY_VALIDATION_ERROR',
  USER_ID_REQUIRED: 'USER_LIBRARY_USER_ID_REQUIRED',
  BOOK_NOT_FOUND: 'USER_LIBRARY_BOOK_NOT_FOUND',
  CHAPTER_NOT_FOUND: 'USER_LIBRARY_CHAPTER_NOT_FOUND',
  ENTRY_NOT_FOUND: 'USER_LIBRARY_ENTRY_NOT_FOUND',
  ILLUSTRATION_NOT_FOUND: 'USER_LIBRARY_ILLUSTRATION_NOT_FOUND',
  UNAUTHORIZED: 'USER_LIBRARY_UNAUTHORIZED',
  FORBIDDEN: 'USER_LIBRARY_FORBIDDEN',
  OWNERSHIP_REQUIRED: 'USER_LIBRARY_OWNERSHIP_REQUIRED',
  BOOK_GENERATION_FAILED: 'USER_LIBRARY_BOOK_GENERATION_FAILED',
  AI_GENERATION_FAILED: 'USER_LIBRARY_AI_GENERATION_FAILED',
  ANALYSIS_ERROR: 'USER_LIBRARY_ANALYSIS_ERROR',
  IMAGE_PROCESSING_ERROR: 'USER_LIBRARY_IMAGE_PROCESSING_ERROR',
  MAX_IMAGES_EXCEEDED: 'USER_LIBRARY_MAX_IMAGES_EXCEEDED',
  INTERNAL_ERROR: 'USER_LIBRARY_INTERNAL_ERROR',
  NOT_FOUND: 'USER_LIBRARY_NOT_FOUND',
  INVALID_DATE_RANGE: 'USER_LIBRARY_INVALID_DATE_RANGE',
  SERVICE_UNAVAILABLE: 'USER_LIBRARY_INTERNAL_ERROR',
} as const;

export const UserLibraryErrorCode = { ...DomainErrorCode, ...UserLibraryDomainCodes } as const;
export type UserLibraryErrorCodeType = (typeof UserLibraryErrorCode)[keyof typeof UserLibraryErrorCode];

const LibraryErrorBase = createDomainServiceError('Library', UserLibraryErrorCode);

export class LibraryError extends LibraryErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: UserLibraryErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new LibraryError(
      `Validation failed for ${field}: ${message}`,
      400,
      UserLibraryErrorCode.VALIDATION_ERROR,
      undefined,
      { field }
    );
  }

  static userIdRequired() {
    return new LibraryError('User ID is required', 400, UserLibraryErrorCode.USER_ID_REQUIRED);
  }

  static bookNotFound(bookId: string) {
    return new LibraryError(`Book not found: ${bookId}`, 404, UserLibraryErrorCode.BOOK_NOT_FOUND, undefined, {
      bookId,
    });
  }

  static chapterNotFound(chapterId: string) {
    return new LibraryError(`Chapter not found: ${chapterId}`, 404, UserLibraryErrorCode.CHAPTER_NOT_FOUND, undefined, {
      chapterId,
    });
  }

  static entryNotFound(entryId: string) {
    return new LibraryError(`Entry not found: ${entryId}`, 404, UserLibraryErrorCode.ENTRY_NOT_FOUND, undefined, {
      entryId,
    });
  }

  static illustrationNotFound(illustrationId: string) {
    return new LibraryError(
      `Illustration not found: ${illustrationId}`,
      404,
      UserLibraryErrorCode.ILLUSTRATION_NOT_FOUND,
      undefined,
      { illustrationId }
    );
  }

  static unauthorized(message: string = 'Unauthorized access to library resource') {
    return new LibraryError(message, 401, UserLibraryErrorCode.UNAUTHORIZED);
  }

  static forbidden(message: string = 'Access to this resource is forbidden') {
    return new LibraryError(message, 403, UserLibraryErrorCode.FORBIDDEN);
  }

  static ownershipRequired(resource: string) {
    return new LibraryError(
      `You do not own this ${resource}`,
      403,
      UserLibraryErrorCode.OWNERSHIP_REQUIRED,
      undefined,
      { resource }
    );
  }

  static bookGenerationFailed(message: string, details?: Record<string, unknown>) {
    return new LibraryError(message, 500, UserLibraryErrorCode.BOOK_GENERATION_FAILED, undefined, details);
  }

  static aiGenerationFailed(message: string, details?: Record<string, unknown>) {
    return new LibraryError(message, 500, UserLibraryErrorCode.AI_GENERATION_FAILED, undefined, details);
  }

  static analysisError(message: string, error?: Error) {
    return new LibraryError(message, 500, UserLibraryErrorCode.ANALYSIS_ERROR, undefined, {
      originalError: error?.message,
    });
  }

  static imageProcessingError(message: string) {
    return new LibraryError(message, 500, UserLibraryErrorCode.IMAGE_PROCESSING_ERROR);
  }

  static maxImagesExceeded(max: number) {
    return new LibraryError(
      `Maximum ${max} images allowed per entry`,
      400,
      UserLibraryErrorCode.MAX_IMAGES_EXCEEDED,
      undefined,
      { max }
    );
  }

  static internalError(message: string, error?: Error) {
    return new LibraryError(message, 500, UserLibraryErrorCode.INTERNAL_ERROR, undefined, {
      originalError: error?.message,
    });
  }

  static notFound(message: string) {
    return new LibraryError(message, 404, UserLibraryErrorCode.NOT_FOUND);
  }

  static invalidDateRange(start: Date, end: Date) {
    return new LibraryError(
      `Invalid date range: start (${start.toISOString()}) must be before end (${end.toISOString()})`,
      400,
      UserLibraryErrorCode.INVALID_DATE_RANGE,
      undefined,
      { start, end }
    );
  }
}

const UserAnalyticsDomainCodes = {
  VALIDATION_ERROR: 'ANALYTICS_VALIDATION_ERROR',
  USER_ID_REQUIRED: 'ANALYTICS_USER_ID_REQUIRED',
  CONTENT_ID_REQUIRED: 'ANALYTICS_CONTENT_ID_REQUIRED',
  CONTENT_TYPE_REQUIRED: 'ANALYTICS_CONTENT_TYPE_REQUIRED',
  INVALID_ANALYTICS_DEPTH: 'ANALYTICS_INVALID_DEPTH',
  INVALID_DATE_RANGE: 'ANALYTICS_INVALID_DATE_RANGE',
  NOT_FOUND: 'ANALYTICS_NOT_FOUND',
  INTERNAL_ERROR: 'ANALYTICS_INTERNAL_ERROR',
  UNAUTHORIZED: 'ANALYTICS_VALIDATION_ERROR',
  FORBIDDEN: 'ANALYTICS_VALIDATION_ERROR',
  SERVICE_UNAVAILABLE: 'ANALYTICS_INTERNAL_ERROR',
} as const;

export const AnalyticsErrorCode = { ...DomainErrorCode, ...UserAnalyticsDomainCodes } as const;
export type AnalyticsErrorCodeType = (typeof AnalyticsErrorCode)[keyof typeof AnalyticsErrorCode];

const UserAnalyticsErrorBase = createDomainServiceError('Analytics', AnalyticsErrorCode);

export class AnalyticsError extends UserAnalyticsErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: AnalyticsErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new AnalyticsError(
      `Validation failed for ${field}: ${message}`,
      400,
      AnalyticsErrorCode.VALIDATION_ERROR,
      undefined,
      { field }
    );
  }

  static userIdRequired() {
    return new AnalyticsError('User ID is required', 400, AnalyticsErrorCode.USER_ID_REQUIRED);
  }

  static contentIdRequired() {
    return new AnalyticsError('Content ID is required', 400, AnalyticsErrorCode.CONTENT_ID_REQUIRED);
  }

  static contentTypeRequired() {
    return new AnalyticsError('Content type is required', 400, AnalyticsErrorCode.CONTENT_TYPE_REQUIRED);
  }

  static invalidAnalyticsDepth(depth?: string) {
    return new AnalyticsError('Invalid analytics depth', 400, AnalyticsErrorCode.INVALID_ANALYTICS_DEPTH, undefined, {
      depth,
    });
  }

  static invalidDateRange(start: Date, end: Date) {
    return new AnalyticsError(
      `Invalid date range: start (${start.toISOString()}) must be before end (${end.toISOString()})`,
      400,
      AnalyticsErrorCode.INVALID_DATE_RANGE,
      undefined,
      { start, end }
    );
  }

  static notFound(resource: string, id: string) {
    return new AnalyticsError(`${resource} not found`, 404, AnalyticsErrorCode.NOT_FOUND, undefined, { resource, id });
  }

  static internalError(message: string, error?: Error) {
    return new AnalyticsError(message, 500, AnalyticsErrorCode.INTERNAL_ERROR, undefined, {
      originalError: error?.message,
    });
  }
}

const InsightsDomainCodes = {
  VALIDATION_ERROR: 'INSIGHTS_VALIDATION_ERROR',
  USER_ID_REQUIRED: 'INSIGHTS_USER_ID_REQUIRED',
  INSIGHT_NOT_FOUND: 'INSIGHTS_INSIGHT_NOT_FOUND',
  REFLECTION_NOT_FOUND: 'INSIGHTS_REFLECTION_NOT_FOUND',
  OWNERSHIP_REQUIRED: 'INSIGHTS_OWNERSHIP_REQUIRED',
  INVALID_ANALYSIS_DEPTH: 'INSIGHTS_INVALID_ANALYSIS_DEPTH',
  INVALID_DATE_RANGE: 'INSIGHTS_INVALID_DATE_RANGE',
  INVALID_GOAL_MODE: 'INSIGHTS_INVALID_GOAL_MODE',
  INVALID_MAX_GOALS: 'INSIGHTS_INVALID_MAX_GOALS',
  INVALID_CONFIDENCE_THRESHOLD: 'INSIGHTS_INVALID_CONFIDENCE_THRESHOLD',
  INSUFFICIENT_DATA: 'INSIGHTS_INSUFFICIENT_DATA',
  INTERNAL_ERROR: 'INSIGHTS_INTERNAL_ERROR',
  NOT_FOUND: 'INSIGHTS_INSIGHT_NOT_FOUND',
  UNAUTHORIZED: 'INSIGHTS_VALIDATION_ERROR',
  FORBIDDEN: 'INSIGHTS_OWNERSHIP_REQUIRED',
  SERVICE_UNAVAILABLE: 'INSIGHTS_INTERNAL_ERROR',
} as const;

export const InsightsErrorCode = { ...DomainErrorCode, ...InsightsDomainCodes } as const;
export type InsightsErrorCodeType = (typeof InsightsErrorCode)[keyof typeof InsightsErrorCode];

const InsightsErrorBase = createDomainServiceError('Insights', InsightsErrorCode);

export class InsightsError extends InsightsErrorBase {
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: InsightsErrorCodeType,
    cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, code, cause);
    this.details = details;
  }

  static validationError(field: string, message: string) {
    return new InsightsError(
      `Validation failed for ${field}: ${message}`,
      400,
      InsightsErrorCode.VALIDATION_ERROR,
      undefined,
      { field }
    );
  }

  static userIdRequired() {
    return new InsightsError('User ID is required', 400, InsightsErrorCode.USER_ID_REQUIRED);
  }

  static insightNotFound(insightId: string) {
    return new InsightsError(`Insight not found: ${insightId}`, 404, InsightsErrorCode.INSIGHT_NOT_FOUND, undefined, {
      insightId,
    });
  }

  static reflectionNotFound(reflectionId: string) {
    return new InsightsError(
      `Reflection not found: ${reflectionId}`,
      404,
      InsightsErrorCode.REFLECTION_NOT_FOUND,
      undefined,
      { reflectionId }
    );
  }

  static ownershipRequired(message: string = 'User does not own this insight') {
    return new InsightsError(message, 403, InsightsErrorCode.OWNERSHIP_REQUIRED);
  }

  static invalidAnalysisDepth(depth?: string) {
    return new InsightsError('Invalid analysis depth', 400, InsightsErrorCode.INVALID_ANALYSIS_DEPTH, undefined, {
      depth,
    });
  }

  static invalidDateRange(start: Date, end: Date) {
    return new InsightsError(
      `Invalid date range: start (${start.toISOString()}) must be before end (${end.toISOString()})`,
      400,
      InsightsErrorCode.INVALID_DATE_RANGE,
      undefined,
      { start, end }
    );
  }

  static invalidGoalMode(mode?: string) {
    return new InsightsError('Invalid goal generation mode', 400, InsightsErrorCode.INVALID_GOAL_MODE, undefined, {
      mode,
    });
  }

  static invalidMaxGoals(message: string = 'Max new goals must be between 1 and 20') {
    return new InsightsError(message, 400, InsightsErrorCode.INVALID_MAX_GOALS);
  }

  static invalidConfidenceThreshold(message: string = 'Confidence threshold must be between 0 and 1') {
    return new InsightsError(message, 400, InsightsErrorCode.INVALID_CONFIDENCE_THRESHOLD);
  }

  static insufficientData(message: string, minRequired?: number) {
    return new InsightsError(
      message,
      422,
      InsightsErrorCode.INSUFFICIENT_DATA,
      undefined,
      minRequired ? { minRequired } : undefined
    );
  }

  static internalError(message: string, error?: Error) {
    return new InsightsError(message, 500, InsightsErrorCode.INTERNAL_ERROR, undefined, {
      originalError: error?.message,
    });
  }
}
