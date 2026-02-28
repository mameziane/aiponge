/**
 * Music Service Infrastructure Repositories
 * Catalog, streaming, and library data repositories
 *
 * NOTE: All PostgreSQL* repositories have been migrated to Drizzle* pattern
 * and are now located in ../database/ directory
 */

export type { ILibraryRepository } from './ILibraryRepository';

export { DrizzleLibraryRepository } from '../database/DrizzleLibraryRepository';
export { DrizzleMusicCatalogRepository } from '../database/DrizzleMusicCatalogRepository';
export { DrizzlePlaylistRepository } from '../database/DrizzlePlaylistRepository';
export { DrizzleStreamingRepository } from '../database/DrizzleStreamingRepository';
export { UnifiedAlbumRepository, type AlbumEntity } from '../database/UnifiedAlbumRepository';
