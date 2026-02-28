import { useState, useCallback } from 'react';
import type { RepeatMode } from '../../types';

interface PlaybackControlsReturn {
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  handleToggleShuffle: () => void;
  handleCycleRepeat: () => void;
  setShuffleEnabled: (enabled: boolean) => void;
  setRepeatMode: (mode: RepeatMode) => void;
}

export function usePlaybackControls(): PlaybackControlsReturn {
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');

  const handleToggleShuffle = useCallback(() => {
    setShuffleEnabled(prev => !prev);
  }, []);

  const handleCycleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'one';
      if (prev === 'one') return 'all';
      return 'off';
    });
  }, []);

  return {
    shuffleEnabled,
    repeatMode,
    handleToggleShuffle,
    handleCycleRepeat,
    setShuffleEnabled,
    setRepeatMode,
  };
}

export default usePlaybackControls;
