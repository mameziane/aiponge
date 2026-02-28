/**
 * Hooks Index
 *
 * Domain-based hook organization. Import from specific domains to avoid name conflicts:
 * - @/hooks/auth - Authentication hooks
 * - @/hooks/music - Music playback and generation hooks
 * - @/hooks/book - Unified library hooks (books, chapters, entries - includes personal books)
 * - @/hooks/book-utils - Book-specific utilities (blueprints, reminders, insights)
 * - @/hooks/playlists - Music library and playlist hooks
 * - @/hooks/commerce - Credits and subscription hooks
 * - @/hooks/admin - Admin and librarian hooks
 * - @/hooks/profile - User profile hooks
 * - @/hooks/system - App initialization and system hooks
 * - @/hooks/ui - UI utility hooks
 */

// Re-export domain modules for namespace access
export * as authHooks from './auth';
export * as musicHooks from './music';
export * as bookHooks from './book';
export * as playlistsHooks from './playlists';
export * as commerceHooks from './commerce';
export * as adminHooks from './admin';
export * as profileHooks from './profile';
export * as systemHooks from './system';
export * as uiHooks from './ui';
