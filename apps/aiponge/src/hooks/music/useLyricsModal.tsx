import { useState, useCallback } from 'react';

interface LyricsModalState {
  visible: boolean;
  lyricsId?: string;
  trackTitle: string;
}

interface Track {
  lyricsId?: string | null;
  title: string;
}

export function useLyricsModal() {
  const [lyricsModal, setLyricsModal] = useState<LyricsModalState>({
    visible: false,
    lyricsId: undefined,
    trackTitle: '',
  });

  const handleShowLyrics = useCallback((track: Track) => {
    setLyricsModal({
      visible: true,
      lyricsId: track.lyricsId || undefined,
      trackTitle: track.title,
    });
  }, []);

  const handleCloseLyrics = useCallback(() => {
    setLyricsModal({
      visible: false,
      lyricsId: undefined,
      trackTitle: '',
    });
  }, []);

  return {
    lyricsModal,
    handleShowLyrics,
    handleCloseLyrics,
  };
}

export default useLyricsModal;
