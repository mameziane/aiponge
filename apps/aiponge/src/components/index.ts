/**
 * Components Index
 *
 * Domain-based component organization. Import from specific domains for clarity:
 * - @/components/admin - Admin dashboard and librarian components
 * - @/components/auth - Authentication and onboarding components
 * - @/components/book - Book, writing, entries, and reflection components
 * - @/components/commerce - Credits, subscriptions, and billing components
 * - @/components/EntryNavigator - Entry navigation and editing
 * - @/components/playlists - Albums, playlists, and music collection management
 * - @/components/music - Playback, tracks, and music generation
 * - @/components/profile - User profile and settings components
 * - @/components/reminders - Unified reminder management
 * - @/components/system - App-level system components
 * - @/components/shared - Reusable utility components
 * - @/components/ui - Base UI primitives
 */

// Re-export domain modules for namespace access
export * as adminComponents from './admin';
export * as authComponents from './auth';
export * as bookComponents from './book';
export * as commerceComponents from './commerce';
export * as playlistsComponents from './playlists';
export * as musicComponents from './music';
export * as profileComponents from './profile';
export * as systemComponents from './system';
export * as sharedComponents from './shared';
export * as uiComponents from './ui';
