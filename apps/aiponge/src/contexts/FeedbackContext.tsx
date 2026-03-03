import { useEffect, useRef, type ReactNode } from 'react';
import { usePlaybackState } from './PlaybackContext';
import { useFeedbackPrompt } from '../hooks/ui/useFeedbackPrompt';
import { FeedbackPromptModal } from '../components/shared/FeedbackPromptModal';

/**
 * Global feedback provider that detects track completions from PlaybackContext
 * and shows a throttled feedback modal (every Nth completed track).
 *
 * Place this inside PlaybackProvider so it can read currentTrack.
 * It replaces per-screen useFeedbackPrompt + FeedbackPromptModal wiring.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { currentTrack } = usePlaybackState();
  const {
    showFeedbackModal,
    feedbackTrackId,
    feedbackTrackTitle,
    handleTrackFinished,
    closeFeedbackModal,
    markFeedbackGiven,
  } = useFeedbackPrompt();

  // Track the previous currentTrack so we can detect completions
  const prevTrackRef = useRef<{ id: string; title?: string } | null>(null);

  useEffect(() => {
    const prevTrack = prevTrackRef.current;
    const newTrackId = currentTrack?.id ?? null;
    const prevTrackId = prevTrack?.id ?? null;

    // When currentTrack transitions away from a previous track, that track "finished"
    if (prevTrackId && prevTrackId !== newTrackId) {
      handleTrackFinished(prevTrackId, prevTrack?.title);
    }

    // Update ref to the current track
    prevTrackRef.current = currentTrack ? { id: currentTrack.id, title: currentTrack.title } : null;
  }, [currentTrack, handleTrackFinished]);

  return (
    <>
      {children}
      {feedbackTrackId && (
        <FeedbackPromptModal
          visible={showFeedbackModal}
          trackId={feedbackTrackId}
          trackTitle={feedbackTrackTitle}
          onClose={closeFeedbackModal}
          onFeedbackSubmitted={markFeedbackGiven}
        />
      )}
    </>
  );
}
