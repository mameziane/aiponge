export const TEMPLATE_IDS = {
  SYSTEM_PROMPT: 'system-prompt',
  EMOTION_ANALYSIS: 'emotion-analysis',
  ENTRY_ANALYSIS: 'entry-analysis',
  IMAGE_ANALYSIS: 'image-analysis',
  ALBUM_ARTWORK: 'album-artwork',
  PLAYLIST_ARTWORK: 'playlist-artwork',
  BOOK_COVER_ARTWORK: 'book-cover-artwork',
  QUOTE_INSPIRATION: 'quote-inspiration',
  MUSIC_LYRICS: 'music-lyrics',
  MUSIC_SONG_TITLE: 'music-song-title',
  MUSIC_PERSONALIZATION: 'music-personalization',
} as const;

export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];
