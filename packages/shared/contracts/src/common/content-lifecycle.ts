import { z } from 'zod';

export const CONTENT_LIFECYCLE = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

export type ContentLifecycleStatus = (typeof CONTENT_LIFECYCLE)[keyof typeof CONTENT_LIFECYCLE];

export const ContentLifecycleSchema = z.enum([
  CONTENT_LIFECYCLE.DRAFT,
  CONTENT_LIFECYCLE.ACTIVE,
  CONTENT_LIFECYCLE.PUBLISHED,
  CONTENT_LIFECYCLE.ARCHIVED,
  CONTENT_LIFECYCLE.DELETED,
]);

export const ALBUM_LIFECYCLE = {
  DRAFT: CONTENT_LIFECYCLE.DRAFT,
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  PUBLISHED: CONTENT_LIFECYCLE.PUBLISHED,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
} as const;

export type AlbumLifecycleStatus = (typeof ALBUM_LIFECYCLE)[keyof typeof ALBUM_LIFECYCLE];

export const AlbumLifecycleSchema = z.enum([
  ALBUM_LIFECYCLE.DRAFT,
  ALBUM_LIFECYCLE.ACTIVE,
  ALBUM_LIFECYCLE.PUBLISHED,
  ALBUM_LIFECYCLE.ARCHIVED,
]);

export const TRACK_LIFECYCLE = {
  DRAFT: CONTENT_LIFECYCLE.DRAFT,
  PROCESSING: 'processing',
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  PUBLISHED: CONTENT_LIFECYCLE.PUBLISHED,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
  DELETED: CONTENT_LIFECYCLE.DELETED,
} as const;

export type TrackLifecycleStatus = (typeof TRACK_LIFECYCLE)[keyof typeof TRACK_LIFECYCLE];

export const TrackLifecycleSchema = z.enum([
  TRACK_LIFECYCLE.DRAFT,
  TRACK_LIFECYCLE.PROCESSING,
  TRACK_LIFECYCLE.ACTIVE,
  TRACK_LIFECYCLE.PUBLISHED,
  TRACK_LIFECYCLE.ARCHIVED,
  TRACK_LIFECYCLE.DELETED,
]);

export const PLAYLIST_LIFECYCLE = {
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
  DELETED: CONTENT_LIFECYCLE.DELETED,
} as const;

export type PlaylistLifecycleStatus = (typeof PLAYLIST_LIFECYCLE)[keyof typeof PLAYLIST_LIFECYCLE];

export const PlaylistLifecycleSchema = z.enum([
  PLAYLIST_LIFECYCLE.ACTIVE,
  PLAYLIST_LIFECYCLE.ARCHIVED,
  PLAYLIST_LIFECYCLE.DELETED,
]);

export const BOOK_LIFECYCLE = {
  DRAFT: CONTENT_LIFECYCLE.DRAFT,
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
} as const;

export type BookLifecycleStatus = (typeof BOOK_LIFECYCLE)[keyof typeof BOOK_LIFECYCLE];

export const BookLifecycleSchema = z.enum([BOOK_LIFECYCLE.DRAFT, BOOK_LIFECYCLE.ACTIVE, BOOK_LIFECYCLE.ARCHIVED]);

export const AI_CONTENT_LIFECYCLE = {
  DRAFT: CONTENT_LIFECYCLE.DRAFT,
  GENERATED: 'generated',
  REVIEWED: 'reviewed',
  PUBLISHED: CONTENT_LIFECYCLE.PUBLISHED,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
} as const;

export type AiContentLifecycleStatus = (typeof AI_CONTENT_LIFECYCLE)[keyof typeof AI_CONTENT_LIFECYCLE];

export const AiContentLifecycleSchema = z.enum([
  AI_CONTENT_LIFECYCLE.DRAFT,
  AI_CONTENT_LIFECYCLE.GENERATED,
  AI_CONTENT_LIFECYCLE.REVIEWED,
  AI_CONTENT_LIFECYCLE.PUBLISHED,
  AI_CONTENT_LIFECYCLE.ARCHIVED,
]);

export const FILE_VERSION_LIFECYCLE = {
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  ARCHIVED: CONTENT_LIFECYCLE.ARCHIVED,
  DELETED: CONTENT_LIFECYCLE.DELETED,
} as const;

export type FileVersionLifecycleStatus = (typeof FILE_VERSION_LIFECYCLE)[keyof typeof FILE_VERSION_LIFECYCLE];

export const FileVersionLifecycleSchema = z.enum([
  FILE_VERSION_LIFECYCLE.ACTIVE,
  FILE_VERSION_LIFECYCLE.ARCHIVED,
  FILE_VERSION_LIFECYCLE.DELETED,
]);

export const STORAGE_FILE_LIFECYCLE = {
  ACTIVE: CONTENT_LIFECYCLE.ACTIVE,
  ORPHANED: 'orphaned',
  DELETED: CONTENT_LIFECYCLE.DELETED,
} as const;

export type StorageFileLifecycleStatus = (typeof STORAGE_FILE_LIFECYCLE)[keyof typeof STORAGE_FILE_LIFECYCLE];

export const StorageFileLifecycleSchema = z.enum([
  STORAGE_FILE_LIFECYCLE.ACTIVE,
  STORAGE_FILE_LIFECYCLE.ORPHANED,
  STORAGE_FILE_LIFECYCLE.DELETED,
]);

export type TransitionMap = Record<string, readonly string[]>;

export const BASE_TRANSITIONS: TransitionMap = {
  [CONTENT_LIFECYCLE.DRAFT]: [
    CONTENT_LIFECYCLE.ACTIVE,
    CONTENT_LIFECYCLE.PUBLISHED,
    CONTENT_LIFECYCLE.ARCHIVED,
    CONTENT_LIFECYCLE.DELETED,
  ],
  [CONTENT_LIFECYCLE.ACTIVE]: [CONTENT_LIFECYCLE.PUBLISHED, CONTENT_LIFECYCLE.ARCHIVED, CONTENT_LIFECYCLE.DELETED],
  [CONTENT_LIFECYCLE.PUBLISHED]: [CONTENT_LIFECYCLE.ARCHIVED, CONTENT_LIFECYCLE.DELETED],
  [CONTENT_LIFECYCLE.ARCHIVED]: [CONTENT_LIFECYCLE.ACTIVE, CONTENT_LIFECYCLE.DELETED],
  [CONTENT_LIFECYCLE.DELETED]: [],
};

export const ALBUM_TRANSITIONS: TransitionMap = {
  [ALBUM_LIFECYCLE.DRAFT]: [ALBUM_LIFECYCLE.ACTIVE, ALBUM_LIFECYCLE.PUBLISHED, ALBUM_LIFECYCLE.ARCHIVED],
  [ALBUM_LIFECYCLE.ACTIVE]: [ALBUM_LIFECYCLE.PUBLISHED, ALBUM_LIFECYCLE.ARCHIVED],
  [ALBUM_LIFECYCLE.PUBLISHED]: [ALBUM_LIFECYCLE.ARCHIVED],
  [ALBUM_LIFECYCLE.ARCHIVED]: [ALBUM_LIFECYCLE.ACTIVE],
};

export const TRACK_TRANSITIONS: TransitionMap = {
  [TRACK_LIFECYCLE.DRAFT]: [
    TRACK_LIFECYCLE.PROCESSING,
    TRACK_LIFECYCLE.ACTIVE,
    TRACK_LIFECYCLE.PUBLISHED,
    TRACK_LIFECYCLE.DELETED,
  ],
  [TRACK_LIFECYCLE.PROCESSING]: [TRACK_LIFECYCLE.ACTIVE, TRACK_LIFECYCLE.PUBLISHED, TRACK_LIFECYCLE.DELETED],
  [TRACK_LIFECYCLE.ACTIVE]: [TRACK_LIFECYCLE.PUBLISHED, TRACK_LIFECYCLE.ARCHIVED, TRACK_LIFECYCLE.DELETED],
  [TRACK_LIFECYCLE.PUBLISHED]: [TRACK_LIFECYCLE.ARCHIVED, TRACK_LIFECYCLE.DELETED],
  [TRACK_LIFECYCLE.ARCHIVED]: [TRACK_LIFECYCLE.ACTIVE, TRACK_LIFECYCLE.DELETED],
  [TRACK_LIFECYCLE.DELETED]: [],
};

export const PLAYLIST_TRANSITIONS: TransitionMap = {
  [PLAYLIST_LIFECYCLE.ACTIVE]: [PLAYLIST_LIFECYCLE.ARCHIVED, PLAYLIST_LIFECYCLE.DELETED],
  [PLAYLIST_LIFECYCLE.ARCHIVED]: [PLAYLIST_LIFECYCLE.ACTIVE, PLAYLIST_LIFECYCLE.DELETED],
  [PLAYLIST_LIFECYCLE.DELETED]: [],
};

export const BOOK_TRANSITIONS: TransitionMap = {
  [BOOK_LIFECYCLE.DRAFT]: [BOOK_LIFECYCLE.ACTIVE, BOOK_LIFECYCLE.ARCHIVED],
  [BOOK_LIFECYCLE.ACTIVE]: [BOOK_LIFECYCLE.ARCHIVED],
  [BOOK_LIFECYCLE.ARCHIVED]: [BOOK_LIFECYCLE.ACTIVE],
};

export const AI_CONTENT_TRANSITIONS: TransitionMap = {
  [AI_CONTENT_LIFECYCLE.DRAFT]: [AI_CONTENT_LIFECYCLE.GENERATED, AI_CONTENT_LIFECYCLE.ARCHIVED],
  [AI_CONTENT_LIFECYCLE.GENERATED]: [
    AI_CONTENT_LIFECYCLE.REVIEWED,
    AI_CONTENT_LIFECYCLE.PUBLISHED,
    AI_CONTENT_LIFECYCLE.ARCHIVED,
  ],
  [AI_CONTENT_LIFECYCLE.REVIEWED]: [AI_CONTENT_LIFECYCLE.PUBLISHED, AI_CONTENT_LIFECYCLE.ARCHIVED],
  [AI_CONTENT_LIFECYCLE.PUBLISHED]: [AI_CONTENT_LIFECYCLE.ARCHIVED],
  [AI_CONTENT_LIFECYCLE.ARCHIVED]: [],
};

export const FILE_VERSION_TRANSITIONS: TransitionMap = {
  [FILE_VERSION_LIFECYCLE.ACTIVE]: [FILE_VERSION_LIFECYCLE.ARCHIVED, FILE_VERSION_LIFECYCLE.DELETED],
  [FILE_VERSION_LIFECYCLE.ARCHIVED]: [FILE_VERSION_LIFECYCLE.ACTIVE, FILE_VERSION_LIFECYCLE.DELETED],
  [FILE_VERSION_LIFECYCLE.DELETED]: [],
};

export const STORAGE_FILE_TRANSITIONS: TransitionMap = {
  [STORAGE_FILE_LIFECYCLE.ACTIVE]: [STORAGE_FILE_LIFECYCLE.ORPHANED, STORAGE_FILE_LIFECYCLE.DELETED],
  [STORAGE_FILE_LIFECYCLE.ORPHANED]: [STORAGE_FILE_LIFECYCLE.ACTIVE, STORAGE_FILE_LIFECYCLE.DELETED],
  [STORAGE_FILE_LIFECYCLE.DELETED]: [],
};

export function canTransitionTo(from: string, to: string, transitions: TransitionMap): boolean {
  const allowed = transitions[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly domain?: string
  ) {
    const domainLabel = domain ? ` [${domain}]` : '';
    super(`Invalid status transition${domainLabel}: '${from}' → '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export function assertValidTransition(from: string, to: string, transitions: TransitionMap, domain?: string): void {
  if (!canTransitionTo(from, to, transitions)) {
    throw new InvalidStatusTransitionError(from, to, domain);
  }
}

const USER_VISIBLE_STATUSES = new Set<string>([CONTENT_LIFECYCLE.ACTIVE, CONTENT_LIFECYCLE.PUBLISHED]);

const EDITABLE_STATUSES = new Set<string>([CONTENT_LIFECYCLE.DRAFT, CONTENT_LIFECYCLE.ACTIVE]);

const TERMINAL_STATUSES = new Set<string>([CONTENT_LIFECYCLE.DELETED]);

export function isUserVisibleStatus(status: string | null | undefined): boolean {
  return USER_VISIBLE_STATUSES.has(status ?? '');
}

export function isEditableStatus(status: string | null | undefined): boolean {
  return EDITABLE_STATUSES.has(status ?? '');
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.has(status ?? '');
}

export function isDraftStatus(status: string | null | undefined): boolean {
  return status === CONTENT_LIFECYCLE.DRAFT;
}

export function isActiveStatus(status: string | null | undefined): boolean {
  return status === CONTENT_LIFECYCLE.ACTIVE;
}

export function isPublishedStatus(status: string | null | undefined): boolean {
  return status === CONTENT_LIFECYCLE.PUBLISHED;
}

export function isArchivedStatus(status: string | null | undefined): boolean {
  return status === CONTENT_LIFECYCLE.ARCHIVED;
}

export function isDeletedStatus(status: string | null | undefined): boolean {
  return status === CONTENT_LIFECYCLE.DELETED;
}

export function userVisibleStatuses(): readonly string[] {
  return [CONTENT_LIFECYCLE.ACTIVE, CONTENT_LIFECYCLE.PUBLISHED] as const;
}

export function nonDeletedStatuses(): readonly string[] {
  return [
    CONTENT_LIFECYCLE.DRAFT,
    CONTENT_LIFECYCLE.ACTIVE,
    CONTENT_LIFECYCLE.PUBLISHED,
    CONTENT_LIFECYCLE.ARCHIVED,
  ] as const;
}

export function nonDeletedAlbumStatuses(): readonly string[] {
  return [ALBUM_LIFECYCLE.DRAFT, ALBUM_LIFECYCLE.ACTIVE, ALBUM_LIFECYCLE.PUBLISHED, ALBUM_LIFECYCLE.ARCHIVED] as const;
}

export function nonDeletedTrackStatuses(): readonly string[] {
  return [
    TRACK_LIFECYCLE.DRAFT,
    TRACK_LIFECYCLE.PROCESSING,
    TRACK_LIFECYCLE.ACTIVE,
    TRACK_LIFECYCLE.PUBLISHED,
    TRACK_LIFECYCLE.ARCHIVED,
  ] as const;
}

export function userVisibleTrackStatuses(): readonly string[] {
  return [TRACK_LIFECYCLE.ACTIVE, TRACK_LIFECYCLE.PUBLISHED] as const;
}

export function editableAlbumStatuses(): readonly string[] {
  return [ALBUM_LIFECYCLE.DRAFT, ALBUM_LIFECYCLE.ACTIVE, ALBUM_LIFECYCLE.PUBLISHED] as const;
}

export function statusInClause(statuses: readonly string[]): string {
  return statuses.map(s => `'${s}'`).join(', ');
}

export function userVisibleStatusSql(): string {
  return statusInClause(userVisibleStatuses());
}

export function nonDeletedStatusSql(): string {
  return statusInClause(nonDeletedStatuses());
}

export function editableAlbumStatusSql(): string {
  return statusInClause(editableAlbumStatuses());
}

export function userVisibleTrackStatusSql(): string {
  return statusInClause(userVisibleTrackStatuses());
}
