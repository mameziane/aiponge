import { QueryClient } from '@tanstack/react-query';
import { BOOK_TYPE_IDS } from '@aiponge/shared-contracts';
import { queryKeys } from './queryKeys';

export type CacheEvent =
  | { type: 'BOOK_CREATED' }
  | { type: 'BOOK_UPDATED'; bookId: string }
  | { type: 'BOOK_DELETED'; bookId: string }
  | { type: 'CHAPTER_CREATED'; bookId: string }
  | { type: 'CHAPTER_UPDATED'; chapterId: string; bookId?: string }
  | { type: 'CHAPTER_DELETED'; chapterId: string; bookId?: string }
  | { type: 'CHAPTER_MOVED'; chapterId: string; fromBookId: string; toBookId: string }
  | { type: 'ENTRY_CREATED'; entryId?: string; bookId?: string }
  | { type: 'ENTRY_UPDATED'; entryId: string; bookId?: string }
  | { type: 'ENTRY_DELETED'; entryId: string; bookId?: string }
  | { type: 'TRACK_CREATED'; entryId?: string; isLibrarian?: boolean }
  | { type: 'TRACK_UPDATED'; trackId: string }
  | { type: 'TRACK_DELETED'; trackId: string }
  | { type: 'TRACK_LIKED'; trackId: string }
  | { type: 'TRACK_UNLIKED'; trackId: string }
  | { type: 'TRACK_FAVORITED'; trackId: string }
  | { type: 'TRACK_UNFAVORITED'; trackId: string }
  | { type: 'PLAYLIST_CREATED' }
  | { type: 'PLAYLIST_UPDATED'; playlistId: string }
  | { type: 'PLAYLIST_DELETED'; playlistId: string }
  | { type: 'PLAYLIST_TRACK_ADDED'; playlistId: string }
  | { type: 'PLAYLIST_TRACK_REMOVED'; playlistId: string }
  | { type: 'PLAYLIST_FOLLOWED'; playlistId: string }
  | { type: 'PLAYLIST_UNFOLLOWED'; playlistId: string }
  | { type: 'ALBUM_CREATED' }
  | { type: 'ALBUM_UPDATED'; albumId: string }
  | { type: 'ALBUM_DELETED'; albumId: string }
  | { type: 'ALBUM_LIKED'; albumId: string; userId?: string }
  | { type: 'ALBUM_UNLIKED'; albumId: string; userId?: string }
  | { type: 'CREATOR_FOLLOWED'; creatorId: string; userId?: string }
  | { type: 'CREATOR_UNFOLLOWED'; creatorId: string; userId?: string }
  | { type: 'PROFILE_UPDATED' }
  | { type: 'MUSIC_PREFERENCES_UPDATED' }
  | { type: 'CREDITS_CHANGED' }
  | { type: 'REMINDER_UPDATED' }
  | { type: 'SHARED_LIBRARY_UPDATED' }
  | { type: 'APP_INIT_REFRESH' }
  | { type: 'INSIGHT_GENERATED'; entryId: string }
  | { type: 'ACTIVITY_SCHEDULE_DELETED' }
  | { type: 'ACTIVITY_ALARM_DELETED' }
  | { type: 'CREDIT_GIFT_SENT' }
  | { type: 'CREDIT_GIFT_CLAIMED' }
  | { type: 'PATTERN_ANALYZED'; userId?: string }
  | { type: 'TRACK_FEEDBACK_SUBMITTED'; trackId: string }
  | { type: 'ADMIN_CONFIG_UPDATED' }
  | { type: 'ADMIN_TEMPLATES_UPDATED' }
  | { type: 'ADMIN_PROVIDERS_UPDATED' }
  | { type: 'TRACK_GENERATION_COMPLETED' }
  | { type: 'ALBUM_GENERATION_COMPLETED' }
  | { type: 'ACTIVITY_CALENDAR_UPDATED'; date?: string }
  | { type: 'PLAYLIST_ARTWORK_UPDATED'; playlistId?: string }
  | { type: 'BOOK_REMINDER_DELETED' }
  | { type: 'REMINDER_DELETED' }
  | { type: 'REMINDER_CREATED' }
  | { type: 'PRIVATE_LIBRARY_UPDATED'; playlistId?: string }
  | { type: 'ONBOARDING_COMPLETED'; userId?: string }
  | { type: 'LIBRARY_BOOK_CREATED'; bookId?: string; typeId?: string }
  | { type: 'LIBRARY_BOOK_UPDATED'; bookId: string; typeId?: string }
  | { type: 'LIBRARY_BOOK_DELETED'; bookId: string; typeId?: string }
  | { type: 'LIBRARY_BOOK_PUBLISHED'; bookId: string }
  | { type: 'LIBRARY_CHAPTER_CREATED'; bookId: string }
  | { type: 'LIBRARY_CHAPTER_UPDATED'; chapterId: string; bookId?: string }
  | { type: 'LIBRARY_CHAPTER_DELETED'; chapterId: string; bookId?: string }
  | { type: 'LIBRARY_ENTRY_CREATED'; chapterId?: string; bookId?: string }
  | { type: 'LIBRARY_ENTRY_UPDATED'; entryId: string; chapterId?: string }
  | { type: 'LIBRARY_ENTRY_DELETED'; entryId: string; chapterId?: string }
  | { type: 'LIBRARY_BOOK_SAVED'; bookId: string }
  | { type: 'LIBRARY_BOOK_REMOVED'; bookId: string }
  | { type: 'LIBRARY_READING_PROGRESS_UPDATED'; bookId: string }
  | { type: 'SUBSCRIPTION_USAGE_UPDATED' }
  | { type: 'CREATOR_INVITATION_CREATED' }
  | { type: 'CREATOR_INVITATION_DELETED' }
  | { type: 'CREATOR_MEMBER_REMOVED' }
  | { type: 'CREATOR_MEMBER_JOINED' };

type InvalidationTarget = {
  key: readonly unknown[];
  refetchAll?: boolean;
};

function t(key: readonly unknown[], refetchAll = false): InvalidationTarget {
  return refetchAll ? { key, refetchAll } : { key };
}

type InvalidationResolver<E extends CacheEvent = CacheEvent> =
  | InvalidationTarget[]
  | ((event: E) => InvalidationTarget[]);

type InvalidationMap = {
  [K in CacheEvent['type']]: InvalidationResolver<Extract<CacheEvent, { type: K }>>;
};

const trackLikeToggle = (e: { trackId: string }): InvalidationTarget[] => [
  t(queryKeys.tracks.likes()),
  t(queryKeys.tracks.detail(e.trackId)),
];

const trackFavoriteToggle = (e: { trackId: string }): InvalidationTarget[] => [
  t(queryKeys.tracks.favorites()),
  t(queryKeys.tracks.detail(e.trackId)),
  t(queryKeys.tracks.myMusic()),
  t(queryKeys.playlists.all),
];

const playlistTrackChange = (e: { playlistId: string }): InvalidationTarget[] => [
  t(queryKeys.playlists.detail(e.playlistId)),
  t(queryKeys.playlists.tracks(e.playlistId)),
];

const playlistFollowToggle = (e: { playlistId: string }): InvalidationTarget[] => [
  t(queryKeys.playlists.followed()),
  t(queryKeys.playlists.detail(e.playlistId)),
];

const albumLikeToggle = (e: { albumId: string; userId?: string }): InvalidationTarget[] => [
  t(queryKeys.albums.liked(e.userId)),
  t(queryKeys.albums.detail(e.albumId)),
];

const creatorFollowToggle = (e: { userId?: string }): InvalidationTarget[] => [
  t(queryKeys.creators.followed(e.userId)),
];

const creditGiftChange: InvalidationTarget[] = [t(queryKeys.credits.gifts()), t(queryKeys.credits.balance())];

const reminderChange: InvalidationTarget[] = [t(queryKeys.reminders.all())];

const creatorInvitationChange: InvalidationTarget[] = [t(queryKeys.creatorMembers.invitations())];

const libraryBookSaveToggle = (e: { bookId: string }): InvalidationTarget[] => [
  t(queryKeys.library.userLibrary()),
  t(queryKeys.library.bookDetail(e.bookId)),
];

const playlistListChange: InvalidationTarget[] = [t(queryKeys.playlists.all)];

const INVALIDATION_RULES: InvalidationMap = {
  BOOK_CREATED: [t(queryKeys.personalBooks.all)],

  BOOK_UPDATED: e => [t(queryKeys.personalBooks.all), t(queryKeys.personalBooks.detail(e.bookId))],

  BOOK_DELETED: [
    t(queryKeys.personalBooks.all),
    t(queryKeys.entries.all),
    t(queryKeys.chapters.all),
    t(queryKeys.tracks.myMusic()),
  ],

  CHAPTER_CREATED: e => [
    t(queryKeys.chapters.all),
    t(queryKeys.chapters.byBook(e.bookId)),
    t(queryKeys.personalBooks.all),
  ],

  CHAPTER_UPDATED: e => [
    t(queryKeys.chapters.all),
    ...(e.chapterId ? [t(queryKeys.chapters.detail(e.chapterId))] : []),
    ...(e.bookId ? [t(queryKeys.chapters.byBook(e.bookId))] : []),
  ],

  CHAPTER_DELETED: e => [
    t(queryKeys.chapters.all),
    t(queryKeys.entries.all),
    ...(e.bookId ? [t(queryKeys.chapters.byBook(e.bookId))] : []),
  ],

  CHAPTER_MOVED: e => [
    t(queryKeys.chapters.all),
    t(queryKeys.chapters.byBook(e.fromBookId)),
    t(queryKeys.chapters.byBook(e.toBookId)),
    t(queryKeys.personalBooks.all),
  ],

  ENTRY_CREATED: e => [
    t(queryKeys.entries.all),
    t(queryKeys.chapters.all),
    ...(e.bookId ? [t(queryKeys.entries.byBook(e.bookId))] : []),
  ],

  ENTRY_UPDATED: e => [t(queryKeys.entries.all), t(queryKeys.entries.detail(e.entryId))],

  ENTRY_DELETED: e => [
    t(queryKeys.entries.all),
    t(queryKeys.chapters.all),
    ...(e.bookId ? [t(queryKeys.entries.byBook(e.bookId))] : []),
  ],

  TRACK_CREATED: e => [
    t(queryKeys.tracks.all),
    t(queryKeys.tracks.private()),
    t(queryKeys.tracks.explore()),
    t(queryKeys.entries.withSongs()),
    t(queryKeys.credits.all),
    ...(e.entryId ? [t(queryKeys.tracks.byEntry(e.entryId)), t(queryKeys.entries.detail(e.entryId))] : []),
    ...(e.isLibrarian
      ? [
          t(queryKeys.sharedLibrary.all),
          t(queryKeys.sharedLibrary.tracks()),
          t(queryKeys.sharedLibrary.librarianAlbums()),
        ]
      : []),
  ],

  TRACK_UPDATED: e => [t(queryKeys.tracks.all), t(queryKeys.tracks.detail(e.trackId))],

  TRACK_DELETED: [t(queryKeys.tracks.all), t(queryKeys.entries.withSongs()), t(queryKeys.playlists.all)],

  TRACK_LIKED: trackLikeToggle,
  TRACK_UNLIKED: trackLikeToggle,
  TRACK_FAVORITED: trackFavoriteToggle,
  TRACK_UNFAVORITED: trackFavoriteToggle,

  PLAYLIST_CREATED: playlistListChange,
  PLAYLIST_DELETED: playlistListChange,

  PLAYLIST_UPDATED: e => [t(queryKeys.playlists.all), t(queryKeys.playlists.detail(e.playlistId))],

  PLAYLIST_TRACK_ADDED: playlistTrackChange,
  PLAYLIST_TRACK_REMOVED: playlistTrackChange,
  PLAYLIST_FOLLOWED: playlistFollowToggle,
  PLAYLIST_UNFOLLOWED: playlistFollowToggle,

  ALBUM_CREATED: [t(queryKeys.albums.all)],

  ALBUM_UPDATED: e => [t(queryKeys.albums.all), t(queryKeys.albums.detail(e.albumId))],

  ALBUM_DELETED: [t(queryKeys.albums.all, true), t(queryKeys.tracks.myMusic()), t(queryKeys.sharedLibrary.all)],

  ALBUM_LIKED: albumLikeToggle,
  ALBUM_UNLIKED: albumLikeToggle,
  CREATOR_FOLLOWED: creatorFollowToggle,
  CREATOR_UNFOLLOWED: creatorFollowToggle,

  PROFILE_UPDATED: [t(queryKeys.profile.all), t(queryKeys.appInit.all)],

  MUSIC_PREFERENCES_UPDATED: [t(['profile', 'musicPreferences'] as const)],

  CREDITS_CHANGED: [t(queryKeys.credits.all), t(queryKeys.appInit.all)],

  REMINDER_UPDATED: reminderChange,

  SHARED_LIBRARY_UPDATED: [t(queryKeys.sharedLibrary.all)],

  APP_INIT_REFRESH: [t(queryKeys.appInit.all), t(queryKeys.profile.all), t(queryKeys.credits.all)],

  INSIGHT_GENERATED: e => [t(queryKeys.entries.insights(e.entryId))],

  ACTIVITY_SCHEDULE_DELETED: [t(queryKeys.activity.all), t(queryKeys.activity.calendar())],

  ACTIVITY_ALARM_DELETED: [t(queryKeys.activity.all), t(queryKeys.activity.alarms()), t(queryKeys.activity.calendar())],

  CREDIT_GIFT_SENT: creditGiftChange,
  CREDIT_GIFT_CLAIMED: creditGiftChange,

  PATTERN_ANALYZED: [t(queryKeys.patterns.all)],

  TRACK_FEEDBACK_SUBMITTED: e => [t(queryKeys.feedback.track(e.trackId))],

  ADMIN_CONFIG_UPDATED: [t(queryKeys.admin.all)],

  ADMIN_TEMPLATES_UPDATED: [t(queryKeys.admin.prompts()), t(queryKeys.admin.templates())],

  ADMIN_PROVIDERS_UPDATED: [t(queryKeys.admin.all)],

  TRACK_GENERATION_COMPLETED: [t(queryKeys.tracks.private(), true), t(queryKeys.tracks.explore(), true)],

  ALBUM_GENERATION_COMPLETED: [
    t(queryKeys.albums.all, true),
    t(queryKeys.albums.public(), true),
    t(queryKeys.albums.shared(), true),
    t(queryKeys.tracks.explore(), true),
    t(queryKeys.sharedLibrary.librarianAlbums(), true),
    t(queryKeys.sharedLibrary.all, true),
  ],

  ACTIVITY_CALENDAR_UPDATED: e => [
    t(queryKeys.activity.all),
    t(queryKeys.activity.calendar()),
    t(queryKeys.activity.alarms()),
    ...(e.date ? [t(queryKeys.activity.day(e.date))] : []),
  ],

  PLAYLIST_ARTWORK_UPDATED: e => [
    t(queryKeys.playlists.all),
    ...(e.playlistId ? [t(queryKeys.playlists.detail(e.playlistId))] : []),
  ],

  BOOK_REMINDER_DELETED: [t(queryKeys.reminders.book())],
  REMINDER_DELETED: reminderChange,
  REMINDER_CREATED: reminderChange,

  PRIVATE_LIBRARY_UPDATED: e => [
    t(queryKeys.tracks.private()),
    t(queryKeys.tracks.explore()),
    ...(e.playlistId ? [t(queryKeys.playlists.tracks(e.playlistId))] : []),
  ],

  ONBOARDING_COMPLETED: [t(queryKeys.profile.all), t(queryKeys.onboarding.all), t(queryKeys.appInit.all)],

  LIBRARY_BOOK_CREATED: e => [
    t(queryKeys.library.all),
    t(queryKeys.library.myBooks()),
    t(queryKeys.library.manageBooks()),
    ...(e.typeId ? [t(queryKeys.library.manageBooks(e.typeId))] : []),
    ...(e.typeId === BOOK_TYPE_IDS.PERSONAL
      ? [t(queryKeys.library.myPersonalBooks()), t(queryKeys.personalBooks.all)]
      : []),
    ...(e.typeId && e.typeId !== BOOK_TYPE_IDS.PERSONAL ? [t(queryKeys.library.myBooksByType(e.typeId))] : []),
  ],

  LIBRARY_BOOK_UPDATED: e => [
    t(queryKeys.library.bookDetail(e.bookId)),
    t(queryKeys.library.myBooks()),
    t(queryKeys.library.manageBooks()),
    ...(e.typeId ? [t(queryKeys.library.manageBooks(e.typeId))] : []),
    t(queryKeys.library.manageBookDetail(e.bookId)),
    t(queryKeys.library.publicBooks()),
    ...(e.typeId === BOOK_TYPE_IDS.PERSONAL
      ? [t(queryKeys.personalBooks.all), t(queryKeys.personalBooks.detail(e.bookId))]
      : []),
  ],

  LIBRARY_BOOK_DELETED: e => [
    t(queryKeys.library.all),
    t(queryKeys.library.myBooks()),
    t(queryKeys.library.manageBooks()),
    ...(e.typeId ? [t(queryKeys.library.manageBooks(e.typeId))] : []),
    ...(e.typeId === BOOK_TYPE_IDS.PERSONAL
      ? [
          t(queryKeys.library.myPersonalBooks()),
          t(queryKeys.personalBooks.all),
          t(queryKeys.chapters.all),
          t(queryKeys.entries.all),
        ]
      : []),
  ],

  LIBRARY_BOOK_PUBLISHED: e => [
    t(queryKeys.library.bookDetail(e.bookId)),
    t(queryKeys.library.publicBooks()),
    t(queryKeys.library.manageBooks()),
    t(queryKeys.library.manageBookDetail(e.bookId)),
  ],

  LIBRARY_CHAPTER_CREATED: e => [
    t(queryKeys.library.chapters(e.bookId)),
    t(queryKeys.library.bookDetail(e.bookId)),
    t(queryKeys.chapters.all),
  ],

  LIBRARY_CHAPTER_UPDATED: e => [
    t(queryKeys.library.chapterDetail(e.chapterId)),
    ...(e.bookId ? [t(queryKeys.library.chapters(e.bookId))] : []),
    t(queryKeys.chapters.all),
  ],

  LIBRARY_CHAPTER_DELETED: e => [
    t(queryKeys.library.all),
    ...(e.bookId ? [t(queryKeys.library.chapters(e.bookId)), t(queryKeys.library.bookDetail(e.bookId))] : []),
    t(queryKeys.chapters.all),
  ],

  LIBRARY_ENTRY_CREATED: e => [
    ...(e.chapterId
      ? [t(queryKeys.library.entries(e.chapterId)), t(queryKeys.library.chapterDetail(e.chapterId))]
      : []),
    ...(e.bookId ? [t(queryKeys.library.bookDetail(e.bookId))] : []),
    t(queryKeys.entries.all),
  ],

  LIBRARY_ENTRY_UPDATED: e => [
    t(queryKeys.library.entryDetail(e.entryId)),
    ...(e.chapterId ? [t(queryKeys.library.entries(e.chapterId))] : []),
    t(queryKeys.entries.all),
  ],

  LIBRARY_ENTRY_DELETED: e => [
    t(queryKeys.library.all),
    ...(e.chapterId
      ? [t(queryKeys.library.entries(e.chapterId)), t(queryKeys.library.chapterDetail(e.chapterId))]
      : []),
    t(queryKeys.entries.all),
    t(queryKeys.chapters.all),
  ],

  LIBRARY_BOOK_SAVED: libraryBookSaveToggle,
  LIBRARY_BOOK_REMOVED: libraryBookSaveToggle,

  LIBRARY_READING_PROGRESS_UPDATED: e => [
    t(queryKeys.library.readingProgress(e.bookId)),
    t(queryKeys.library.userLibrary()),
  ],

  SUBSCRIPTION_USAGE_UPDATED: [t(queryKeys.subscription.usage())],

  CREATOR_INVITATION_CREATED: creatorInvitationChange,
  CREATOR_INVITATION_DELETED: creatorInvitationChange,

  CREATOR_MEMBER_REMOVED: [t(queryKeys.creatorMembers.members())],

  CREATOR_MEMBER_JOINED: [t(queryKeys.creatorMembers.following()), t(queryKeys.creatorMembers.members())],
};

function resolveTargets<E extends CacheEvent>(event: E): InvalidationTarget[] {
  const resolver = INVALIDATION_RULES[event.type as CacheEvent['type']];
  if (!resolver) return [];
  if (Array.isArray(resolver)) return resolver;
  return (resolver as (e: E) => InvalidationTarget[])(event);
}

export function invalidateOnEvent(queryClient: QueryClient, event: CacheEvent): void {
  const targets = resolveTargets(event);
  for (const target of targets) {
    queryClient.invalidateQueries({
      queryKey: target.key,
      ...(target.refetchAll ? { refetchType: 'all' } : {}),
    });
  }
}

export function invalidateOnEvents(queryClient: QueryClient, events: CacheEvent[]): void {
  events.forEach(event => invalidateOnEvent(queryClient, event));
}

export function createCacheInvalidator(queryClient: QueryClient) {
  return {
    invalidate: (event: CacheEvent) => invalidateOnEvent(queryClient, event),
    invalidateMany: (events: CacheEvent[]) => invalidateOnEvents(queryClient, events),
  };
}
