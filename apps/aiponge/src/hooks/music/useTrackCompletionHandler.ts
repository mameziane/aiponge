import { useEffect, useState } from 'react';
import { trackGenerationEvents, type TrackCompletionEvent } from '../../stores';
import { useTranslation } from '../../i18n';
import { useToast } from '../ui/use-toast';

interface UseTrackCompletionHandlerOptions {
  refetch: () => Promise<unknown>;
  onAutoPlayReady?: (trackId: string, seekPosition: number) => void;
}

export function useTrackCompletionHandler({ refetch, onAutoPlayReady }: UseTrackCompletionHandlerOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isRefetchingAfterCompletion, setIsRefetchingAfterCompletion] = useState(false);

  useEffect(() => {
    const unsubscribe = trackGenerationEvents.subscribe((event: TrackCompletionEvent) => {
      if (event.status === 'failed') {
        const errorMsg = event.errorMessage || '';
        const isLyricsError = /\[LYRICS_(FAILED|PERSISTENCE_FAILED|GENERATION_FAILED)\]/i.test(errorMsg);
        const isAudioError = /\[AUDIO_FAILED\]/i.test(errorMsg);
        const isStorageError = /\[STORAGE_FAILED\]/i.test(errorMsg);

        let title: string;
        let description: string;

        if (isLyricsError) {
          title = t('hooks.musicGeneration.lyricsGenerationFailed', { defaultValue: 'Lyrics Generation Failed' });
          description = t('hooks.musicGeneration.couldNotGenerateLyrics', {
            defaultValue: "We couldn't find the words this time. Let's try again.",
          });
        } else if (isAudioError) {
          title = t('hooks.musicGeneration.songFailed', { defaultValue: 'Song creation failed' });
          description = t('hooks.musicGeneration.audioGenerationFailed', {
            defaultValue: "The music couldn't be created. Please try again.",
          });
        } else if (isStorageError) {
          title = t('hooks.musicGeneration.songFailed', { defaultValue: 'Song creation failed' });
          description = t('hooks.musicGeneration.storageFailed', {
            defaultValue: 'There was a problem saving your song. Please try again.',
          });
        } else {
          title = t('hooks.musicGeneration.songFailed', { defaultValue: 'Song creation failed' });
          description = t('hooks.musicGeneration.tryAgain', { defaultValue: 'Please try again later' });
        }

        toast({ title, description, variant: 'destructive' });
      } else if (event.status === 'completed' && event.trackId) {
        if (event.wasPlayingPreview && onAutoPlayReady) {
          onAutoPlayReady(event.trackId, event.previewPosition || 0);
        }
        setIsRefetchingAfterCompletion(true);
        refetch().finally(() => {
          setIsRefetchingAfterCompletion(false);
        });
      }
    });
    return unsubscribe;
  }, [toast, t, refetch, onAutoPlayReady]);

  return { isRefetchingAfterCompletion };
}
