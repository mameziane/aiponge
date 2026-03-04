/**
 * Track Share Hook
 * Handles sharing track info (with optional lyrics preview) via the platform Share API.
 */

import { useCallback } from 'react';
import { Share, Alert } from 'react-native';
import { logger } from '../../../lib/logger';
import type { TrackData, LyricsData } from './useTrackData';

function extractLyricPreview(lyricsData: LyricsData | null): string {
  if (!lyricsData) return '';

  // If we have synced lines, extract first 2-3 lines
  if (lyricsData.syncedLines && lyricsData.syncedLines.length > 0) {
    const previewLines = lyricsData.syncedLines
      .slice(0, 3)
      .map(line => line.text)
      .filter(text => text && text.trim().length > 0);
    return previewLines.join('\n');
  }

  // Otherwise, extract first 2-3 lines from content
  if (lyricsData.content) {
    const lines = lyricsData.content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 3);
    return lines.join('\n');
  }

  return '';
}

export function useTrackShare(
  track: TrackData | null,
  lyrics: LyricsData | null,
  displayName: string,
  t: (key: string) => string
) {
  const shareTrack = useCallback(
    async (includeLyrics: boolean) => {
      if (!track) return;

      try {
        const effectiveDisplayName = track.displayName;
        const isUserCreated = effectiveDisplayName === 'You' || effectiveDisplayName === displayName;

        let message: string;

        if (isUserCreated) {
          message = `\uD83C\uDFB5 "${track.title}"\n\n${t('components.trackDetails.shareUserCreatedMessage')}`;
        } else {
          const artistInfo = effectiveDisplayName ? ` ${t('common.by')} ${effectiveDisplayName}` : '';
          message = `\uD83C\uDFB5 "${track.title}"${artistInfo}\n\n${t('components.trackDetails.shareLibraryTrackMessage')}`;
        }

        if (includeLyrics && lyrics) {
          const preview = extractLyricPreview(lyrics);
          if (preview) {
            message += `\n\n\uD83D\uDCDD ${t('components.trackDetails.lyricPreview')}:\n"${preview}..."\n`;
          }
        }

        message += `\n\n${t('components.trackDetails.discoverYourSound')}:\n\uD83C\uDFB5 www.aiponge.app`;

        const result = await Share.share({ message });

        if (result.action === Share.sharedAction) {
          logger.debug('Track shared successfully');
        }
      } catch (error: unknown) {
        const typedError = error as { message?: string };
        Alert.alert(
          t('components.trackDetails.unableToShare'),
          typedError?.message || t('components.trackDetails.shareError')
        );
      }
    },
    [track, lyrics, displayName, t]
  );

  const handleShare = useCallback(() => {
    if (!track) return;

    Alert.alert(
      t('components.trackDetails.shareTrack'),
      track.lyricsId
        ? t('components.trackDetails.includeLyricsQuestion')
        : t('components.trackDetails.shareWithOthers'),
      track.lyricsId
        ? [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('components.trackDetails.withoutLyrics'), onPress: () => shareTrack(false) },
            { text: t('components.trackDetails.withLyricsPreview'), onPress: () => shareTrack(true) },
          ]
        : [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('components.trackDetails.share'), onPress: () => shareTrack(false) },
          ],
      { cancelable: true }
    );
  }, [track, t, shareTrack]);

  return { handleShare };
}
