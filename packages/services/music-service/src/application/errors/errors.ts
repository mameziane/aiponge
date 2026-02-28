import { DomainError, DomainErrorCode, createDomainServiceError } from '@aiponge/platform-core';

const MusicDomainCodes = {
  ALBUM_NOT_FOUND: 'ALBUM_NOT_FOUND',
  ALBUM_ALREADY_EXISTS: 'ALBUM_ALREADY_EXISTS',
  INVALID_ALBUM_DATA: 'INVALID_ALBUM_DATA',
  TRACK_NOT_FOUND: 'TRACK_NOT_FOUND',
  TRACK_ALREADY_EXISTS: 'TRACK_ALREADY_EXISTS',
  INVALID_TRACK_DATA: 'INVALID_TRACK_DATA',
  MISSING_TITLE: 'MISSING_TITLE',
  INVALID_DURATION: 'INVALID_DURATION',
  MISSING_FILE_URL: 'MISSING_FILE_URL',
  DUPLICATE_ISRC: 'DUPLICATE_ISRC',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  TRACK_UPDATE_FAILED: 'TRACK_UPDATE_FAILED',
  PLAYLIST_NOT_FOUND: 'PLAYLIST_NOT_FOUND',
  PLAYLIST_ACCESS_DENIED: 'PLAYLIST_ACCESS_DENIED',
  TRACK_ALREADY_IN_PLAYLIST: 'TRACK_ALREADY_IN_PLAYLIST',
  TRACK_NOT_IN_PLAYLIST: 'TRACK_NOT_IN_PLAYLIST',
  PACKAGE_CREATION_FAILED: 'PACKAGE_CREATION_FAILED',
  INVALID_PACKAGE_FORMAT: 'INVALID_PACKAGE_FORMAT',
  SEARCH_FAILED: 'SEARCH_FAILED',
  INVALID_SEARCH_QUERY: 'INVALID_SEARCH_QUERY',
  INVALID_OFFSET: 'INVALID_OFFSET',
  INVALID_LIMIT: 'INVALID_LIMIT',
  INVALID_TRACK_ID: 'INVALID_TRACK_ID',
  CREATION_FAILED: 'CREATION_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INVALID_POSITION: 'INVALID_POSITION',
  ACCESS_DENIED: 'ACCESS_DENIED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INVALID_DATA: 'INVALID_DATA',
} as const;

export const MusicErrorCode = { ...DomainErrorCode, ...MusicDomainCodes } as const;
export type MusicErrorCodeType = (typeof MusicErrorCode)[keyof typeof MusicErrorCode];

const MusicErrorBase = createDomainServiceError('Music', MusicErrorCode);

export class MusicError extends MusicErrorBase {
  static albumNotFound(albumId: string) {
    return new MusicError(`Album not found: ${albumId}`, 404, MusicErrorCode.ALBUM_NOT_FOUND);
  }

  static albumAlreadyExists(identifier: string) {
    return new MusicError(`Album already exists: ${identifier}`, 409, MusicErrorCode.ALBUM_ALREADY_EXISTS);
  }

  static invalidAlbumData(reason: string) {
    return new MusicError(`Invalid album data: ${reason}`, 400, MusicErrorCode.INVALID_ALBUM_DATA);
  }

  static trackNotFound(trackId: string) {
    return new MusicError(`Track not found: ${trackId}`, 404, MusicErrorCode.TRACK_NOT_FOUND);
  }

  static trackAlreadyExists(identifier: string) {
    return new MusicError(`Track already exists: ${identifier}`, 409, MusicErrorCode.TRACK_ALREADY_EXISTS);
  }

  static invalidTrackData(reason: string) {
    return new MusicError(`Invalid track data: ${reason}`, 400, MusicErrorCode.INVALID_TRACK_DATA);
  }

  static missingTitle() {
    return new MusicError('Track title is required', 400, MusicErrorCode.MISSING_TITLE);
  }

  static invalidDuration(reason: string) {
    return new MusicError(`Invalid duration: ${reason}`, 400, MusicErrorCode.INVALID_DURATION);
  }

  static missingFileUrl() {
    return new MusicError('File URL is required', 400, MusicErrorCode.MISSING_FILE_URL);
  }

  static duplicateIsrc(isrc: string) {
    return new MusicError(`Duplicate ISRC: ${isrc}`, 409, MusicErrorCode.DUPLICATE_ISRC);
  }

  static unsupportedFormat(format: string) {
    return new MusicError(`Unsupported format: ${format}`, 400, MusicErrorCode.UNSUPPORTED_FORMAT);
  }

  static trackUpdateFailed(trackId: string, reason: string, cause?: Error) {
    return new MusicError(
      `Track update failed for ${trackId}: ${reason}`,
      500,
      MusicErrorCode.TRACK_UPDATE_FAILED,
      cause
    );
  }

  static playlistNotFound(playlistId: string) {
    return new MusicError(`Playlist not found: ${playlistId}`, 404, MusicErrorCode.PLAYLIST_NOT_FOUND);
  }

  static playlistAccessDenied(playlistId: string) {
    return new MusicError(`Access denied to playlist: ${playlistId}`, 403, MusicErrorCode.PLAYLIST_ACCESS_DENIED);
  }

  static trackAlreadyInPlaylist(trackId: string, playlistId: string) {
    return new MusicError(
      `Track ${trackId} already in playlist ${playlistId}`,
      409,
      MusicErrorCode.TRACK_ALREADY_IN_PLAYLIST
    );
  }

  static trackNotInPlaylist(trackId: string, playlistId: string) {
    return new MusicError(`Track ${trackId} not in playlist ${playlistId}`, 404, MusicErrorCode.TRACK_NOT_IN_PLAYLIST);
  }

  static packageCreationFailed(reason: string, cause?: Error) {
    return new MusicError(`Package creation failed: ${reason}`, 500, MusicErrorCode.PACKAGE_CREATION_FAILED, cause);
  }

  static invalidPackageFormat(format: string) {
    return new MusicError(`Invalid package format: ${format}`, 400, MusicErrorCode.INVALID_PACKAGE_FORMAT);
  }

  static searchFailed(reason: string, cause?: Error) {
    return new MusicError(`Search failed: ${reason}`, 500, MusicErrorCode.SEARCH_FAILED, cause);
  }

  static invalidSearchQuery(reason: string) {
    return new MusicError(`Invalid search query: ${reason}`, 400, MusicErrorCode.INVALID_SEARCH_QUERY);
  }

  static invalidOffset(offset: number) {
    return new MusicError(`Invalid offset: ${offset}`, 400, MusicErrorCode.INVALID_OFFSET);
  }

  static invalidLimit(limit: number) {
    return new MusicError(`Invalid limit: ${limit}`, 400, MusicErrorCode.INVALID_LIMIT);
  }

  static invalidTrackId(trackId: string) {
    return new MusicError(`Invalid track ID: ${trackId}`, 400, MusicErrorCode.INVALID_TRACK_ID);
  }

  static creationFailed(resource: string, reason: string, cause?: Error) {
    return new MusicError(`${resource} creation failed: ${reason}`, 500, MusicErrorCode.CREATION_FAILED, cause);
  }

  static invalidRequest(reason: string) {
    return new MusicError(`Invalid request: ${reason}`, 400, MusicErrorCode.INVALID_REQUEST);
  }

  static invalidStateTransition(fromState: string, toState: string) {
    return new MusicError(
      `Cannot transition from '${fromState}' to '${toState}'`,
      422,
      MusicErrorCode.INVALID_STATE_TRANSITION
    );
  }

  static invalidPosition(reason: string) {
    return new MusicError(`Invalid position: ${reason}`, 400, MusicErrorCode.INVALID_POSITION);
  }

  static accessDenied(resource: string, id: string) {
    return new MusicError(`Access denied to ${resource}: ${id}`, 403, MusicErrorCode.ACCESS_DENIED);
  }

  static updateFailed(resource: string, id: string, reason: string, cause?: Error) {
    return new MusicError(`${resource} update failed for ${id}: ${reason}`, 500, MusicErrorCode.UPDATE_FAILED, cause);
  }

  static deleteFailed(resource: string, id: string, reason: string, cause?: Error) {
    return new MusicError(`${resource} delete failed for ${id}: ${reason}`, 500, MusicErrorCode.DELETE_FAILED, cause);
  }

  static duplicateEntry(resource: string, identifier: string) {
    return new MusicError(`${resource} already exists: ${identifier}`, 409, MusicErrorCode.DUPLICATE_ENTRY);
  }

  static invalidData(resource: string, reason: string) {
    return new MusicError(`Invalid ${resource} data: ${reason}`, 400, MusicErrorCode.INVALID_DATA);
  }
}

export enum ErrorSeverity {
  VALIDATION = 'validation',
  TRANSIENT = 'transient',
  PERMANENT = 'permanent',
}

export enum PipelineErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',

  EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  NETWORK_ERROR = 'NETWORK_ERROR',

  GENERATION_FAILED = 'GENERATION_FAILED',
  PERSISTENCE_FAILED = 'PERSISTENCE_FAILED',
  CONTENT_FETCH_FAILED = 'CONTENT_FETCH_FAILED',
  LYRICS_GENERATION_FAILED = 'LYRICS_GENERATION_FAILED',
  MUSIC_GENERATION_FAILED = 'MUSIC_GENERATION_FAILED',
  ARTWORK_GENERATION_FAILED = 'ARTWORK_GENERATION_FAILED',
  ALBUM_CREATION_FAILED = 'ALBUM_CREATION_FAILED',
  TRACK_LINKING_FAILED = 'TRACK_LINKING_FAILED',

  UNKNOWN = 'UNKNOWN',
}

export interface PipelineErrorDetails {
  code: PipelineErrorCode;
  severity: ErrorSeverity;
  message: string;
  retryable: boolean;
  originalError?: Error;
  context?: Record<string, unknown>;
}

export class PipelineError extends DomainError {
  public readonly code: PipelineErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(details: PipelineErrorDetails, statusCode: number = 500) {
    super(details.message, statusCode, details.originalError);
    this.name = 'PipelineError';
    this.code = details.code;
    this.severity = details.severity;
    this.retryable = details.retryable;
    this.context = details.context;
    this.originalError = details.originalError;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      severity: this.severity,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      statusCode: this.statusCode,
    };
  }

  static validationFailed(field: string, message: string): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.VALIDATION,
        message: `Validation failed for ${field}: ${message}`,
        retryable: false,
      },
      400
    );
  }

  static invalidInput(reason: string): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.INVALID_INPUT,
        severity: ErrorSeverity.VALIDATION,
        message: `Invalid input: ${reason}`,
        retryable: false,
      },
      400
    );
  }

  static missingRequiredField(field: string): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.MISSING_REQUIRED_FIELD,
        severity: ErrorSeverity.VALIDATION,
        message: `Missing required field: ${field}`,
        retryable: false,
      },
      400
    );
  }

  static limitExceeded(limit: string, value: number): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.LIMIT_EXCEEDED,
        severity: ErrorSeverity.VALIDATION,
        message: `Limit exceeded for ${limit}: ${value}`,
        retryable: false,
      },
      400
    );
  }

  static timeout(service: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.EXTERNAL_SERVICE_TIMEOUT,
        severity: ErrorSeverity.TRANSIENT,
        message: `Service timeout: ${service}`,
        retryable: true,
        originalError: cause,
      },
      504
    );
  }

  static serviceUnavailable(service: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
        severity: ErrorSeverity.TRANSIENT,
        message: `Service unavailable: ${service}`,
        retryable: true,
        originalError: cause,
      },
      503
    );
  }

  static rateLimited(service: string): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.RATE_LIMITED,
        severity: ErrorSeverity.TRANSIENT,
        message: `Rate limited by: ${service}`,
        retryable: true,
      },
      429
    );
  }

  static networkError(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.NETWORK_ERROR,
        severity: ErrorSeverity.TRANSIENT,
        message: `Network error: ${reason}`,
        retryable: true,
        originalError: cause,
      },
      503
    );
  }

  static generationFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.GENERATION_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Generation failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static persistenceFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.PERSISTENCE_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Persistence failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static contentFetchFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.CONTENT_FETCH_FAILED,
        severity: ErrorSeverity.TRANSIENT,
        message: `Content fetch failed: ${reason}`,
        retryable: true,
        originalError: cause,
      },
      502
    );
  }

  static lyricsGenerationFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.LYRICS_GENERATION_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Lyrics generation failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static musicGenerationFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.MUSIC_GENERATION_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Music generation failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static artworkGenerationFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.ARTWORK_GENERATION_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Artwork generation failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static albumCreationFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.ALBUM_CREATION_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Album creation failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static trackLinkingFailed(reason: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.TRACK_LINKING_FAILED,
        severity: ErrorSeverity.PERMANENT,
        message: `Track linking failed: ${reason}`,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }

  static internalError(message: string, cause?: Error): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.UNKNOWN,
        severity: ErrorSeverity.PERMANENT,
        message,
        retryable: false,
        originalError: cause,
      },
      500
    );
  }
}

export class ErrorClassifier {
  static classify(error: unknown, defaultCode?: PipelineErrorCode): PipelineErrorDetails {
    const message = error instanceof Error ? error.message : String(error);
    const originalError = error instanceof Error ? error : undefined;

    if (error instanceof PipelineError) {
      return {
        code: error.code,
        severity: error.severity,
        message: error.message,
        retryable: error.retryable,
        originalError: error,
        context: error.context,
      };
    }

    if (error instanceof MusicError) {
      const transientCodes: Set<string> = new Set([MusicErrorCode.SERVICE_UNAVAILABLE]);
      const validationCodes: Set<string> = new Set([
        MusicErrorCode.VALIDATION_ERROR,
        MusicErrorCode.INVALID_ALBUM_DATA,
        MusicErrorCode.INVALID_TRACK_DATA,
        MusicErrorCode.MISSING_TITLE,
        MusicErrorCode.INVALID_DURATION,
        MusicErrorCode.MISSING_FILE_URL,
        MusicErrorCode.INVALID_SEARCH_QUERY,
        MusicErrorCode.INVALID_OFFSET,
        MusicErrorCode.INVALID_LIMIT,
        MusicErrorCode.INVALID_TRACK_ID,
        MusicErrorCode.INVALID_REQUEST,
        MusicErrorCode.INVALID_POSITION,
        MusicErrorCode.INVALID_DATA,
      ]);

      if (transientCodes.has(error.code)) {
        return {
          code: PipelineErrorCode.EXTERNAL_SERVICE_UNAVAILABLE,
          severity: ErrorSeverity.TRANSIENT,
          message,
          retryable: true,
          originalError,
        };
      }
      if (validationCodes.has(error.code)) {
        return {
          code: PipelineErrorCode.VALIDATION_FAILED,
          severity: ErrorSeverity.VALIDATION,
          message,
          retryable: false,
          originalError,
        };
      }
      return {
        code: defaultCode || PipelineErrorCode.UNKNOWN,
        severity: ErrorSeverity.PERMANENT,
        message,
        retryable: false,
        originalError,
      };
    }

    if (error instanceof DomainError) {
      const isValidation = error.statusCode >= 400 && error.statusCode < 500;
      return {
        code: isValidation ? PipelineErrorCode.VALIDATION_FAILED : defaultCode || PipelineErrorCode.UNKNOWN,
        severity: isValidation ? ErrorSeverity.VALIDATION : ErrorSeverity.PERMANENT,
        message,
        retryable: false,
        originalError,
      };
    }

    return {
      code: defaultCode || PipelineErrorCode.UNKNOWN,
      severity: ErrorSeverity.PERMANENT,
      message,
      retryable: false,
      originalError,
    };
  }

  static isTransient(error: unknown): boolean {
    const classified = this.classify(error);
    return classified.severity === ErrorSeverity.TRANSIENT;
  }

  static isValidation(error: unknown): boolean {
    const classified = this.classify(error);
    return classified.severity === ErrorSeverity.VALIDATION;
  }

  static isPermanent(error: unknown): boolean {
    const classified = this.classify(error);
    return classified.severity === ErrorSeverity.PERMANENT;
  }

  static validation(message: string, context?: Record<string, unknown>): PipelineError {
    return new PipelineError(
      {
        code: PipelineErrorCode.VALIDATION_FAILED,
        severity: ErrorSeverity.VALIDATION,
        message,
        retryable: false,
        context,
      },
      400
    );
  }

  static transient(code: PipelineErrorCode, message: string, originalError?: Error): PipelineError {
    return new PipelineError(
      {
        code,
        severity: ErrorSeverity.TRANSIENT,
        message,
        retryable: true,
        originalError,
      },
      503
    );
  }

  static permanent(code: PipelineErrorCode, message: string, originalError?: Error): PipelineError {
    return new PipelineError(
      {
        code,
        severity: ErrorSeverity.PERMANENT,
        message,
        retryable: false,
        originalError,
      },
      500
    );
  }
}

const MusicLibraryDomainCodes = {
  ENTRY_NOT_FOUND: 'LIBRARY_ENTRY_NOT_FOUND',
  USER_ID_REQUIRED: 'LIBRARY_USER_ID_REQUIRED',
  TRACK_ID_REQUIRED: 'LIBRARY_TRACK_ID_REQUIRED',
  DUPLICATE_ENTRY: 'LIBRARY_DUPLICATE_ENTRY',
  VALIDATION_ERROR: 'LIBRARY_VALIDATION_ERROR',
  INVALID_METADATA: 'LIBRARY_INVALID_METADATA',
  INVALID_FORMAT: 'LIBRARY_INVALID_FORMAT',
  INVALID_DURATION: 'LIBRARY_INVALID_DURATION',
  INVALID_POSITION: 'LIBRARY_INVALID_POSITION',
  FORBIDDEN: 'LIBRARY_FORBIDDEN',
  INVALID_STATE_TRANSITION: 'LIBRARY_INVALID_STATE_TRANSITION',
  INTERNAL_ERROR: 'LIBRARY_INTERNAL_ERROR',
  NOT_FOUND: 'LIBRARY_ENTRY_NOT_FOUND',
  UNAUTHORIZED: 'LIBRARY_FORBIDDEN',
  SERVICE_UNAVAILABLE: 'LIBRARY_INTERNAL_ERROR',
} as const;

export const LibraryErrorCode = { ...DomainErrorCode, ...MusicLibraryDomainCodes } as const;
export type LibraryErrorCodeType = (typeof LibraryErrorCode)[keyof typeof LibraryErrorCode];

const MusicLibraryErrorBase = createDomainServiceError('Library', LibraryErrorCode);

export class LibraryError extends MusicLibraryErrorBase {
  static entryNotFound(entryId: string) {
    return new LibraryError(`Library entry not found: ${entryId}`, 404, LibraryErrorCode.ENTRY_NOT_FOUND);
  }

  static userIdRequired() {
    return new LibraryError('User ID is required', 400, LibraryErrorCode.USER_ID_REQUIRED);
  }

  static trackIdRequired() {
    return new LibraryError('Track ID is required', 400, LibraryErrorCode.TRACK_ID_REQUIRED);
  }

  static duplicateEntry(trackId: string) {
    return new LibraryError(`Track already in library: ${trackId}`, 409, LibraryErrorCode.DUPLICATE_ENTRY);
  }

  static invalidMetadata(reason: string) {
    return new LibraryError(`Invalid metadata: ${reason}`, 400, LibraryErrorCode.INVALID_METADATA);
  }

  static invalidFormat(format: string) {
    return new LibraryError(`Invalid format: ${format}`, 400, LibraryErrorCode.INVALID_FORMAT);
  }

  static invalidDuration(reason: string) {
    return new LibraryError(`Invalid duration: ${reason}`, 400, LibraryErrorCode.INVALID_DURATION);
  }

  static invalidPosition(reason: string) {
    return new LibraryError(`Invalid position: ${reason}`, 400, LibraryErrorCode.INVALID_POSITION);
  }

  static invalidStateTransition(fromState: string, toState: string) {
    return new LibraryError(
      `Cannot transition from '${fromState}' to '${toState}'`,
      422,
      LibraryErrorCode.INVALID_STATE_TRANSITION
    );
  }
}

const StreamingDomainCodes = {
  SESSION_NOT_FOUND: 'STREAMING_SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'STREAMING_SESSION_EXPIRED',
  SESSION_ALREADY_ACTIVE: 'STREAMING_SESSION_ALREADY_ACTIVE',
  PLAYBACK_ERROR: 'STREAMING_PLAYBACK_ERROR',
  CONCURRENT_STREAM_LIMIT: 'STREAMING_CONCURRENT_LIMIT',
  TRACK_UNAVAILABLE: 'STREAMING_TRACK_UNAVAILABLE',
  INVALID_POSITION: 'STREAMING_INVALID_POSITION',
  USER_ID_REQUIRED: 'STREAMING_USER_ID_REQUIRED',
  TRACK_ID_REQUIRED: 'STREAMING_TRACK_ID_REQUIRED',
  VALIDATION_ERROR: 'STREAMING_VALIDATION_ERROR',
  INTERNAL_ERROR: 'STREAMING_INTERNAL_ERROR',
  NOT_FOUND: 'STREAMING_SESSION_NOT_FOUND',
  UNAUTHORIZED: 'STREAMING_VALIDATION_ERROR',
  FORBIDDEN: 'STREAMING_VALIDATION_ERROR',
  SERVICE_UNAVAILABLE: 'STREAMING_INTERNAL_ERROR',
} as const;

export const StreamingErrorCode = { ...DomainErrorCode, ...StreamingDomainCodes } as const;
export type StreamingErrorCodeType = (typeof StreamingErrorCode)[keyof typeof StreamingErrorCode];

const StreamingErrorBase = createDomainServiceError('Streaming', StreamingErrorCode);

export class StreamingError extends StreamingErrorBase {
  static sessionNotFound(sessionId: string) {
    return new StreamingError(`Streaming session not found: ${sessionId}`, 404, StreamingErrorCode.SESSION_NOT_FOUND);
  }

  static trackNotFound(trackId: string) {
    return new StreamingError(`Track not found for streaming: ${trackId}`, 404, StreamingErrorCode.TRACK_UNAVAILABLE);
  }

  static invalidPlaybackState(reason: string) {
    return new StreamingError(`Invalid playback state: ${reason}`, 400, StreamingErrorCode.PLAYBACK_ERROR);
  }

  static invalidPosition(position: number) {
    return new StreamingError(`Invalid position: ${position}`, 400, StreamingErrorCode.INVALID_POSITION);
  }

  static invalidDuration(duration: number) {
    return new StreamingError(`Invalid duration: ${duration}`, 400, StreamingErrorCode.PLAYBACK_ERROR);
  }

  static userIdRequired() {
    return new StreamingError('User ID is required', 400, StreamingErrorCode.USER_ID_REQUIRED);
  }

  static trackIdRequired() {
    return new StreamingError('Track ID is required', 400, StreamingErrorCode.TRACK_ID_REQUIRED);
  }

  static playbackFailed(reason: string, cause?: Error) {
    return new StreamingError(`Playback failed: ${reason}`, 500, StreamingErrorCode.PLAYBACK_ERROR, cause);
  }

  static streamingUnavailable(reason: string) {
    return new StreamingError(`Streaming unavailable: ${reason}`, 503, StreamingErrorCode.SESSION_NOT_FOUND);
  }

  static invalidCommand(command: string) {
    return new StreamingError(`Invalid playback command: ${command}`, 400, StreamingErrorCode.PLAYBACK_ERROR);
  }
}
