/**
 * Centralized Query Keys Factory
 *
 * Single source of truth for all React Query cache keys.
 * This ensures consistent cache invalidation across the app.
 *
 * Usage:
 *   queryKey: queryKeys.personalBooks.list()
 *   queryClient.invalidateQueries({ queryKey: queryKeys.personalBooks.all })
 *
 * Pattern: Each domain has:
 *   - `all`: Base key for invalidating all queries in domain
 *   - `list()`: For list queries
 *   - `detail(id)`: For single item queries
 *   - Custom keys for specific use cases
 */

export const queryKeys = {
  personalBooks: {
    all: ['personalBooks'] as const,
    list: () => [...queryKeys.personalBooks.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.personalBooks.all, 'detail', id] as const,
    templates: () => [...queryKeys.personalBooks.all, 'templates'] as const,
  },

  chapters: {
    all: ['chapters'] as const,
    byBook: (bookId: string) => [...queryKeys.chapters.all, 'book', bookId] as const,
    detail: (id: string) => [...queryKeys.chapters.all, 'detail', id] as const,
  },

  entries: {
    all: ['entries'] as const,
    list: (userId?: string) => [...queryKeys.entries.all, 'list', userId] as const,
    byBook: (bookId: string) => [...queryKeys.entries.all, 'book', bookId] as const,
    detail: (id: string) => [...queryKeys.entries.all, 'detail', id] as const,
    simple: (userId?: string) => [...queryKeys.entries.all, 'simple', userId] as const,
    withSongs: () => [...queryKeys.entries.all, 'withSongs'] as const,
    insights: (entryId?: string) => [...queryKeys.entries.all, 'insights', entryId] as const,
  },

  tracks: {
    all: ['tracks'] as const,
    myMusic: () => [...queryKeys.tracks.all, 'myMusic'] as const,
    explore: () => [...queryKeys.tracks.all, 'explore'] as const,
    private: () => [...queryKeys.tracks.all, 'private'] as const,
    shared: () => [...queryKeys.tracks.all, 'shared'] as const,
    detail: (id: string) => [...queryKeys.tracks.all, 'detail', id] as const,
    byEntry: (entryId: string) => [...queryKeys.tracks.all, 'entry', entryId] as const,
    favorites: () => [...queryKeys.tracks.all, 'favorites'] as const,
    likes: () => [...queryKeys.tracks.all, 'likes'] as const,
    liked: (userId?: string) => [...queryKeys.tracks.all, 'liked', userId] as const,
    feedback: (trackId: string) => [...queryKeys.tracks.all, 'feedback', trackId] as const,
  },

  playlists: {
    all: ['playlists'] as const,
    list: () => [...queryKeys.playlists.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.playlists.all, 'detail', id] as const,
    tracks: (playlistId: string) => [...queryKeys.playlists.all, playlistId, 'tracks'] as const,
    smart: () => [...queryKeys.playlists.all, 'smart'] as const,
    smartByUser: (userId?: string) => [...queryKeys.playlists.all, 'smart', userId] as const,
    smartTracks: (userId?: string, smartKey?: string) =>
      [...queryKeys.playlists.all, 'smart', userId, smartKey, 'tracks'] as const,
    followed: () => [...queryKeys.playlists.all, 'followed'] as const,
    byUser: (userId?: string) => [...queryKeys.playlists.all, 'user', userId] as const,
    followers: (playlistId: string) => [...queryKeys.playlists.all, playlistId, 'followers'] as const,
    public: () => [...queryKeys.playlists.all, 'public'] as const,
  },

  albums: {
    all: ['albums'] as const,
    list: () => [...queryKeys.albums.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.albums.all, 'detail', id] as const,
    shared: () => [...queryKeys.albums.all, 'shared'] as const,
    public: () => [...queryKeys.albums.all, 'public'] as const,
    publicDetail: (id: string) => [...queryKeys.albums.all, 'public', id] as const,
    liked: (userId?: string) => [...queryKeys.albums.all, 'liked', userId] as const,
  },

  creators: {
    all: ['creators'] as const,
    followed: (userId?: string) => [...queryKeys.creators.all, 'followed', userId] as const,
  },

  library: {
    all: ['library'] as const,
    books: () => [...queryKeys.library.all, 'books'] as const,
    bookDetail: (id: string) => [...queryKeys.library.all, 'books', id] as const,
    bookTypes: () => [...queryKeys.library.all, 'book-types'] as const,
    myBooks: (typeId?: string) =>
      typeId !== undefined
        ? ([...queryKeys.library.all, 'my-books', typeId] as const)
        : ([...queryKeys.library.all, 'my-books'] as const),
    myPersonalBooks: () => [...queryKeys.library.all, 'my', 'personalBooks'] as const,
    myBooksByType: (typeId: string) => [...queryKeys.library.all, 'my', 'byType', typeId] as const,
    publicBooks: () => [...queryKeys.library.all, 'public'] as const,
    chapters: (bookId: string) => [...queryKeys.library.all, 'chapters', 'by-book', bookId] as const,
    chapterDetail: (id: string) => [...queryKeys.library.all, 'chapters', id] as const,
    allChapters: () => [...queryKeys.library.all, 'all-chapters'] as const,
    entries: (chapterId: string) => [...queryKeys.library.all, 'entries', chapterId] as const,
    entryDetail: (id: string) => [...queryKeys.library.all, 'entries', id] as const,
    entriesByBook: (bookId: string, pageSize?: number) =>
      pageSize !== undefined
        ? ([...queryKeys.library.all, 'entries', 'by-book', bookId, pageSize] as const)
        : ([...queryKeys.library.all, 'entries', 'by-book', bookId] as const),
    userLibrary: () => [...queryKeys.library.all, 'my-library'] as const,
    categories: () => [...queryKeys.library.all, 'categories'] as const,
    traditions: () => [...queryKeys.library.all, 'traditions'] as const,
    readingProgress: (bookId: string) => [...queryKeys.library.all, 'progress', bookId] as const,
    manageBooks: (typeId?: string) =>
      typeId !== undefined
        ? ([...queryKeys.library.all, 'manage', 'books', typeId] as const)
        : ([...queryKeys.library.all, 'manage', 'books'] as const),
    manageBookDetail: (id: string) => [...queryKeys.library.all, 'manage', 'book', id] as const,
  },

  profile: {
    all: ['profile'] as const,
    current: (userId?: string) => [...queryKeys.profile.all, userId] as const,
    detail: (userId: string) => [...queryKeys.profile.all, 'detail', userId] as const,
    metrics: (userId?: string) => [...queryKeys.profile.all, 'metrics', userId] as const,
    musicPreferences: (userId?: string) => [...queryKeys.profile.all, 'musicPreferences', userId] as const,
  },

  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
  },

  onboarding: {
    all: ['onboarding'] as const,
    status: () => [...queryKeys.onboarding.all, 'status'] as const,
    progress: () => [...queryKeys.onboarding.all, 'progress'] as const,
  },

  lyrics: {
    all: ['lyrics'] as const,
    byEntry: (entryId?: string) => [...queryKeys.lyrics.all, 'entry', entryId] as const,
    detail: (id: string) => [...queryKeys.lyrics.all, 'detail', id] as const,
  },

  reminders: {
    all: () => ['reminders', 'all'] as const,
    byType: (type: string) => ['reminders', 'type', type] as const,
    book: () => ['reminders', 'book'] as const,
    detail: (id: string) => ['reminders', 'detail', id] as const,
  },

  credits: {
    all: ['credits'] as const,
    balance: () => [...queryKeys.credits.all, 'balance'] as const,
    policy: () => [...queryKeys.credits.all, 'policy'] as const,
    history: () => [...queryKeys.credits.all, 'history'] as const,
    gifts: () => [...queryKeys.credits.all, 'gifts'] as const,
  },

  subscription: {
    all: ['subscription'] as const,
    usage: () => [...queryKeys.subscription.all, 'usage'] as const,
  },

  creatorMembers: {
    all: ['creatorMembers'] as const,
    following: () => [...queryKeys.creatorMembers.all, 'following'] as const,
    members: () => [...queryKeys.creatorMembers.all, 'members'] as const,
    invitations: () => [...queryKeys.creatorMembers.all, 'invitations'] as const,
  },

  sharedLibrary: {
    all: ['sharedLibrary'] as const,
    tracks: () => [...queryKeys.sharedLibrary.all, 'tracks'] as const,
    featured: () => [...queryKeys.sharedLibrary.all, 'featured'] as const,
    filters: () => [...queryKeys.sharedLibrary.all, 'filters'] as const,
    librarianAlbums: () => [...queryKeys.sharedLibrary.all, 'librarianAlbums'] as const,
  },

  admin: {
    all: ['admin'] as const,
    dashboard: () => [...queryKeys.admin.all, 'dashboard'] as const,
    users: () => [...queryKeys.admin.all, 'users'] as const,
    tracks: () => [...queryKeys.admin.all, 'tracks'] as const,
    prompts: () => [...queryKeys.admin.all, 'prompts'] as const,
    safetyRiskStats: () => [...queryKeys.admin.all, 'safety', 'riskStats'] as const,
    safetyRiskFlags: () => [...queryKeys.admin.all, 'safety', 'riskFlags'] as const,
    safetyCompliance: () => [...queryKeys.admin.all, 'safety', 'compliance'] as const,
    recentErrors: (query?: unknown) => [...queryKeys.admin.all, 'recentErrors', query] as const,
    errorByCorrelation: (correlationId: string | null) => [...queryKeys.admin.all, 'errors', correlationId] as const,
    templates: (category?: string) => [...queryKeys.admin.all, 'templates', category ?? 'all'] as const,
    templateCategories: () => [...queryKeys.admin.all, 'templates', 'categories'] as const,
    musicApiCredits: () => [...queryKeys.admin.all, 'musicApiCredits'] as const,
  },

  appInit: {
    all: ['appInit'] as const,
    user: (userId?: string) => [...queryKeys.appInit.all, userId] as const,
  },

  frameworks: {
    all: ['frameworks'] as const,
    list: () => [...queryKeys.frameworks.all, 'list'] as const,
  },

  patterns: {
    all: ['patterns'] as const,
    list: (userId?: string) => [...queryKeys.patterns.all, 'list', userId] as const,
    insights: (userId?: string) => [...queryKeys.patterns.all, 'insights', userId] as const,
    themes: (userId?: string) => [...queryKeys.patterns.all, 'themes', userId] as const,
  },

  activity: {
    all: ['activity'] as const,
    calendar: () => [...queryKeys.activity.all, 'calendar'] as const,
    alarms: () => [...queryKeys.activity.all, 'alarms'] as const,
    day: (date?: string) => [...queryKeys.activity.all, 'day', date] as const,
    schedules: () => [...queryKeys.activity.all, 'schedules'] as const,
  },

  feedback: {
    all: ['feedback'] as const,
    track: (trackId: string) => [...queryKeys.feedback.all, 'track', trackId] as const,
  },

  config: {
    all: ['config'] as const,
    defaults: ['config', 'defaults'] as const,
    availableOptions: ['config', 'availableOptions'] as const,
    contentLimits: ['config', 'contentLimits'] as const,
  },
} as const;

export type QueryKeyDomain = keyof typeof queryKeys;
