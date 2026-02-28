import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FEEDBACK_GIVEN_KEY = 'feedback_given_tracks';

interface FeedbackTrackInfo {
  id: string;
  title: string;
}

interface UseFeedbackPromptReturn {
  showFeedbackModal: boolean;
  feedbackTrackId: string | null;
  feedbackTrackTitle: string | null;
  handleTrackFinished: (trackId: string, trackTitle?: string) => void;
  closeFeedbackModal: () => void;
  markFeedbackGiven: (trackId: string) => void;
}

export function useFeedbackPrompt(): UseFeedbackPromptReturn {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTrackId, setFeedbackTrackId] = useState<string | null>(null);
  const [feedbackTrackTitle, setFeedbackTrackTitle] = useState<string | null>(null);
  const feedbackGivenTracksRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  const loadFeedbackGivenTracks = useCallback(async () => {
    if (isInitializedRef.current) return;
    try {
      const stored = await AsyncStorage.getItem(FEEDBACK_GIVEN_KEY);
      if (stored) {
        const trackIds = JSON.parse(stored) as string[];
        feedbackGivenTracksRef.current = new Set(trackIds);
      }
      isInitializedRef.current = true;
    } catch {
      isInitializedRef.current = true;
    }
  }, []);

  const saveFeedbackGivenTracks = useCallback(async () => {
    try {
      const trackIds = Array.from(feedbackGivenTracksRef.current);
      const recent = trackIds.slice(-100);
      await AsyncStorage.setItem(FEEDBACK_GIVEN_KEY, JSON.stringify(recent));
    } catch {
      // Ignore storage errors when saving feedback state
    }
  }, []);

  const handleTrackFinished = useCallback(
    async (trackId: string, trackTitle?: string) => {
      await loadFeedbackGivenTracks();

      if (feedbackGivenTracksRef.current.has(trackId)) {
        return;
      }

      setFeedbackTrackId(trackId);
      setFeedbackTrackTitle(trackTitle || null);
      setShowFeedbackModal(true);
    },
    [loadFeedbackGivenTracks]
  );

  const closeFeedbackModal = useCallback(() => {
    setShowFeedbackModal(false);
    setFeedbackTrackId(null);
    setFeedbackTrackTitle(null);
  }, []);

  const markFeedbackGiven = useCallback(
    (trackId: string) => {
      feedbackGivenTracksRef.current.add(trackId);
      saveFeedbackGivenTracks();
      closeFeedbackModal();
    },
    [saveFeedbackGivenTracks, closeFeedbackModal]
  );

  return {
    showFeedbackModal,
    feedbackTrackId,
    feedbackTrackTitle,
    handleTrackFinished,
    closeFeedbackModal,
    markFeedbackGiven,
  };
}
