import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { BaseModal } from '../shared/BaseModal';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { getApiGatewayUrl, API_VERSION_PREFIX } from '../../lib/apiConfig';
import { useAuthStore, selectUser } from '../../auth/store';
import { usePlaybackState } from '../../contexts/PlaybackContext';
import { useMediaPicker } from '../../hooks/ui/useMediaPicker';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';

interface TrackForEdit {
  id: string;
  title: string;
  displayName?: string;
  artworkUrl?: string;
  playOnDate?: string | null;
}

interface EditTrackModalProps {
  visible: boolean;
  onClose: () => void;
  track: TrackForEdit;
  onSave?: () => void;
}

export function EditTrackModal({ visible, onClose, track, onSave }: EditTrackModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  const { updateCurrentTrackMetadata } = usePlaybackState();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(track.title);
  const [displayName, setDisplayName] = useState(track.displayName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newArtworkUri, setNewArtworkUri] = useState<string | null>(null);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false);
  const { pickMedia } = useMediaPicker({ aspect: [1, 1], quality: 0.8 });

  useEffect(() => {
    if (visible) {
      setTitle(track.title);
      setDisplayName(track.displayName || '');
      setNewArtworkUri(null);
      setError(null);
    }
  }, [visible, track]);

  const pickArtwork = async () => {
    const result = await pickMedia();
    if (result) {
      setNewArtworkUri(result.uri);
      logger.debug('[EditTrackModal] New artwork selected', { uri: result.uri });
    }
  };

  const uploadArtwork = async (imageUri: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      const uriParts = imageUri.split('/');
      const fileName = uriParts[uriParts.length - 1] || 'artwork.jpg';
      const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

      formData.append('file', {
        uri: imageUri,
        name: `track_artwork_${track.id}_${Date.now()}.${extension}`,
        type: mimeType,
        // as unknown as Blob: React Native FormData expects {uri,name,type} object cast to Blob
      } as unknown as Blob);

      formData.append('userId', user?.id || '');
      formData.append('isPublic', 'true');
      formData.append('category', 'track-artwork');
      formData.append('tags', JSON.stringify(['track-artwork', track.id]));

      const apiUrl = getApiGatewayUrl();
      const result = await apiClient.upload<{
        success: boolean;
        data?: { url?: string; fileId?: string };
        error?: { message?: string };
      }>(`${API_VERSION_PREFIX}/storage/upload`, formData);
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Upload returned no data');
      }

      let artworkUrl = result.data.url || `${API_VERSION_PREFIX}/storage/download/${result.data.fileId}`;
      if (artworkUrl.startsWith('/')) {
        artworkUrl = `${apiUrl}${artworkUrl}`;
      }

      logger.debug('[EditTrackModal] Artwork uploaded', { artworkUrl });
      return artworkUrl;
    } catch (err) {
      logger.error('[EditTrackModal] Failed to upload artwork', err);
      return null;
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();

    if (!title.trim()) {
      setError(t('editTrack.titleRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (newArtworkUri) {
        setIsUploadingArtwork(true);
        const artworkUrl = await uploadArtwork(newArtworkUri);
        setIsUploadingArtwork(false);

        if (artworkUrl) {
          try {
            await apiClient.patch(`/api/v1/app/library/track/${track.id}/artwork`, {
              artworkUrl,
            });
            updateCurrentTrackMetadata(track.id, { artworkUrl });
            logger.debug('[EditTrackModal] Track artwork updated', { trackId: track.id, artworkUrl });
          } catch (artworkErr: unknown) {
            if (
              (artworkErr as { statusCode?: number })?.statusCode === 403 ||
              (artworkErr as { statusCode?: number })?.statusCode === 404
            ) {
              logger.debug('[EditTrackModal] Cannot update artwork - track not owned', { trackId: track.id });
            } else {
              throw artworkErr;
            }
          }
        } else {
          setError(t('editTrack.artworkUploadFailed'));
          setIsSaving(false);
          return;
        }
      }

      if (title !== track.title || displayName !== (track.displayName || '')) {
        try {
          await apiClient.patch(`/api/v1/app/library/tracks/${track.id}`, {
            title: title.trim(),
            displayName: displayName.trim() || undefined,
          });
          updateCurrentTrackMetadata(track.id, {
            title: title.trim(),
            displayName: displayName.trim() || undefined,
          });
        } catch (patchErr: unknown) {
          if (
            (patchErr as { statusCode?: number })?.statusCode === 403 ||
            (patchErr as { statusCode?: number })?.statusCode === 404
          ) {
            logger.debug('[EditTrackModal] Cannot update track metadata - track not owned', { trackId: track.id });
          } else {
            throw patchErr;
          }
        }
      }

      logger.debug('[EditTrackModal] Track updated successfully', { trackId: track.id });

      invalidateOnEvent(queryClient, { type: 'PRIVATE_LIBRARY_UPDATED' });
      await queryClient.refetchQueries({ queryKey: queryKeys.tracks.private() });

      if (onSave) {
        await onSave();
      }
      onClose();
    } catch (err) {
      logger.error('[EditTrackModal] Failed to update track', err);
      setError(t('editTrack.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = title !== track.title || displayName !== (track.displayName || '') || newArtworkUri !== null;

  const displayArtworkUri = newArtworkUri || track.artworkUrl;

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('editTrack.title')}
      headerIcon="create-outline"
      testID="edit-track-modal"
      scrollable={true}
      avoidKeyboard={true}
      position="top"
    >
      <View style={styles.form}>
        <View style={styles.artworkSection}>
          <Text style={styles.label}>{t('editTrack.artwork')}</Text>
          <TouchableOpacity
            style={styles.artworkPicker}
            onPress={pickArtwork}
            disabled={isSaving}
            testID="button-pick-artwork"
          >
            {displayArtworkUri ? (
              <Image source={{ uri: displayArtworkUri }} style={styles.artworkPreview} />
            ) : (
              <View style={styles.artworkPlaceholder}>
                <Ionicons name="image-outline" size={40} color={colors.text.tertiary} />
              </View>
            )}
            <View style={styles.artworkEditBadge}>
              <Ionicons name="camera" size={14} color={colors.background.surface} />
            </View>
            {isUploadingArtwork && (
              <View style={styles.artworkLoadingOverlay}>
                <ActivityIndicator size="small" color={colors.absolute.white} />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.artworkHint}>{t('editTrack.tapToChangeArtwork')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editTrack.trackName')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('editTrack.trackNamePlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            testID="input-track-title"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editTrack.displayName')}</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('editTrack.displayNamePlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            testID="input-track-displayName"
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            testID="button-cancel-edit"
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            testID="button-save-track"
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.absolute.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    form: {
      gap: 20,
    },
    field: {
      gap: 8,
    },
    artworkSection: {
      alignItems: 'center',
      gap: 8,
    },
    artworkPicker: {
      position: 'relative',
      width: 100,
      height: 100,
      borderRadius: 12,
      overflow: 'hidden',
    },
    artworkPreview: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
    },
    artworkPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.background.darkCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.muted,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
    },
    artworkEditBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    artworkLoadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 12,
    },
    artworkHint: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    input: {
      backgroundColor: colors.background.darkCard,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    errorText: {
      fontSize: 14,
      color: colors.semantic.error,
      textAlign: 'center',
    },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: 'white',
    },
  });
