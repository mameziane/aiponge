/**
 * MiniPlayer UI Store
 * Manages dismiss/show state for the mini player.
 *
 * Rules:
 * - When the user explicitly dismisses the mini player (close button),
 *   it stays hidden until a DIFFERENT track starts playing.
 * - When a new track starts (different track ID), the mini player
 *   auto-shows regardless of the previous dismiss state.
 * - The dismissed flag is purely UI state — it does not affect playback.
 */

import { create } from 'zustand';

interface MiniPlayerUIState {
  /** Whether the user has explicitly dismissed the mini player */
  dismissed: boolean;
  /** Track ID when the dismiss happened — used to detect new tracks */
  dismissedTrackId: string | null;
  /** Dismiss the mini player (user tapped close) */
  dismiss: (currentTrackId: string | null) => void;
  /**
   * Called when the playing track changes.
   * Resets dismissed state if a DIFFERENT track starts.
   */
  onTrackChange: (trackId: string | null) => void;
  /** Reset all state (e.g., on logout) */
  reset: () => void;
}

export const useMiniPlayerStore = create<MiniPlayerUIState>((set, get) => ({
  dismissed: false,
  dismissedTrackId: null,

  dismiss: currentTrackId => {
    set({ dismissed: true, dismissedTrackId: currentTrackId });
  },

  onTrackChange: trackId => {
    const { dismissed, dismissedTrackId } = get();
    if (!dismissed) return; // Not dismissed — nothing to do

    if (trackId === null) {
      // Track cleared (playback ended) — reset dismiss state
      set({ dismissed: false, dismissedTrackId: null });
    } else if (trackId !== dismissedTrackId) {
      // Different track started — auto-show
      set({ dismissed: false, dismissedTrackId: null });
    }
    // Same track (e.g., resumed after pause) — keep dismissed
  },

  reset: () => {
    set({ dismissed: false, dismissedTrackId: null });
  },
}));
