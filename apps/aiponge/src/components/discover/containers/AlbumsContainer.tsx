/**
 * Albums Container
 *
 * Independent render boundary that owns album-related hooks.
 * When album data changes or collapsible sections toggle, only this
 * subtree re-renders — the rest of DiscoverScreen is untouched.
 *
 * Hooks moved here from DiscoverScreen:
 * - useAlbums()
 * - useSharedAlbums()
 * - useDraftAlbum()
 * - useDraftAlbumShared()
 * - useCollapsibleSections('music_screen')
 */

import { memo } from 'react';
import { useAlbums } from '../../../hooks/music/useAlbums';
import { useSharedAlbums } from '../../../hooks/playlists/useSharedAlbums';
import { useDraftAlbum, useDraftAlbumShared } from '../../playlists/DraftAlbumCard';
import { useCollapsibleSections } from '../../../hooks/ui/useCollapsibleSections';
import { AlbumsSection } from '../AlbumsSection';

export const AlbumsContainer = memo(function AlbumsContainer() {
  // Load user's albums for quick access
  const { albums } = useAlbums();

  // Load shared library albums (visible to all users)
  const { albums: sharedAlbums } = useSharedAlbums();

  // Check for active album generations (draft albums - private)
  const { draftAlbums, hasDraftAlbum } = useDraftAlbum();

  // Check for active shared library album generations (draft albums - public)
  const { draftAlbums: draftSharedAlbums, hasDraftAlbum: hasDraftSharedAlbum } = useDraftAlbumShared();

  // Collapsible sections state with persistence
  const { isSectionExpanded, toggleSection } = useCollapsibleSections('music_screen');

  return (
    <AlbumsSection
      albums={albums}
      sharedAlbums={sharedAlbums}
      draftAlbums={draftAlbums}
      draftSharedAlbums={draftSharedAlbums}
      hasDraftAlbum={hasDraftAlbum}
      hasDraftSharedAlbum={hasDraftSharedAlbum}
      isSectionExpanded={isSectionExpanded}
      toggleSection={toggleSection}
    />
  );
});
