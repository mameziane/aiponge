/**
 * Entry Context Hook
 * Manages the selected entry state (content, ID, chapterId, artworkUrl)
 * with atomic updates to prevent race conditions between fields.
 */

import React from 'react';

// Context for setting entry state atomically
// All fields are optional for partial updates - unspecified fields preserve current value
export interface EntryContextUpdate {
  content?: string;
  id?: string | null;
  chapterId?: string | null;
  artworkUrl?: string | null;
}

// Full context for initial setting (all fields required except chapterId/artworkUrl)
export interface EntryContext {
  content: string;
  id: string | null;
  chapterId?: string | null;
  artworkUrl?: string | null;
}

export function useEntryContext() {
  const [selectedEntryContent, _setSelectedEntryContent] = React.useState('');
  const [selectedEntryIdState, _setSelectedEntryIdState] = React.useState<string | null>(null);
  const [selectedEntryArtworkUrl, _setSelectedEntryArtworkUrl] = React.useState<string | null>(null);
  const [selectedEntryChapterId, _setSelectedEntryChapterId] = React.useState<string | null>(null);

  // Unified setter to ensure entry content, ID, chapterId, and artworkUrl stay in sync
  // Accepts partial updates - unspecified fields preserve their current value
  // This prevents race conditions where content and ID could diverge
  const updateEntryContext = React.useCallback((update: EntryContextUpdate) => {
    if (update.content !== undefined) _setSelectedEntryContent(update.content);
    if (update.id !== undefined) _setSelectedEntryIdState(update.id);
    if (update.chapterId !== undefined) _setSelectedEntryChapterId(update.chapterId);
    if (update.artworkUrl !== undefined) _setSelectedEntryArtworkUrl(update.artworkUrl);
  }, []);

  // Full setter for when you want to set ALL fields (e.g., selecting a new entry)
  const setEntryContext = React.useCallback((ctx: EntryContext) => {
    _setSelectedEntryContent(ctx.content);
    _setSelectedEntryIdState(ctx.id);
    _setSelectedEntryChapterId(ctx.chapterId ?? null);
    _setSelectedEntryArtworkUrl(ctx.artworkUrl ?? null);
  }, []);

  // Primary individual setters - prefer updateEntryContext for new code
  const setSelectedEntry = _setSelectedEntryContent;
  const setSelectedEntryId = _setSelectedEntryIdState;
  const setSelectedEntryArtworkUrl = _setSelectedEntryArtworkUrl;
  const setSelectedEntryChapterId = _setSelectedEntryChapterId;

  return React.useMemo(
    () => ({
      selectedEntryContent,
      selectedEntryId: selectedEntryIdState,
      selectedEntryArtworkUrl,
      selectedEntryChapterId,
      updateEntryContext,
      setEntryContext,
      setSelectedEntry,
      setSelectedEntryId,
      setSelectedEntryArtworkUrl,
      setSelectedEntryChapterId,
    }),
    [
      selectedEntryContent,
      selectedEntryIdState,
      selectedEntryArtworkUrl,
      selectedEntryChapterId,
      updateEntryContext,
      setEntryContext,
      setSelectedEntry,
      setSelectedEntryId,
      setSelectedEntryArtworkUrl,
      setSelectedEntryChapterId,
    ]
  );
}
