import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import { BaseModal } from '../shared/BaseModal';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { getApiGatewayUrl, API_VERSION_PREFIX } from '../../lib/apiConfig';
import { useAuthStore, selectUser } from '../../auth/store';
import { useMediaPicker } from '../../hooks/ui/useMediaPicker';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';

interface AlbumForEdit {
  id: string;
  title: string;
  description?: string;
  coverArtworkUrl?: string;
}

interface EditAlbumModalProps {
  visible: boolean;
  onClose: () => void;
  album: AlbumForEdit;
  onSave?: () => void;
}

export function EditAlbumModal({ visible, onClose, album, onSave }: EditAlbumModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newArtworkUri, setNewArtworkUri] = useState<string | null>(null);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false);
  const { pickMedia } = useMediaPicker({ aspect: [1, 1], quality: 0.8 });

  useEffect(() => {
    if (visible) {
      setTitle(album.title);
      setDescription(album.description || '');
      setNewArtworkUri(null);
      setError(null);
    }
  }, [visible, album]);

  const pickArtwork = async () => {
    const result = await pickMedia();
    if (result) {
      setNewArtworkUri(result.uri);
      logger.debug('[EditAlbumModal] New artwork selected', { uri: result.uri });
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
        name: `album_artwork_${album.id}_${Date.now()}.${extension}`,
        type: mimeType,
        // as unknown as Blob: React Native FormData expects {uri,name,type} object cast to Blob
      } as unknown as Blob);

      formData.append('userId', user?.id || '');
      formData.append('isPublic', 'true');
      formData.append('category', 'album-artwork');
      formData.append('tags', JSON.stringify(['album-artwork', album.id]));

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

      logger.debug('[EditAlbumModal] Artwork uploaded', { artworkUrl });
      return artworkUrl;
    } catch (err) {
      logger.error('[EditAlbumModal] Failed to upload artwork', err);
      return null;
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();

    if (!title.trim()) {
      setError(t('editAlbum.titleRequired'));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let artworkUrl: string | undefined = undefined;

      if (newArtworkUri) {
        setIsUploadingArtwork(true);
        artworkUrl = (await uploadArtwork(newArtworkUri)) || undefined;
        setIsUploadingArtwork(false);

        if (!artworkUrl) {
          setError(t('editAlbum.artworkUploadFailed'));
          setIsSaving(false);
          return;
        }
      }

      const trimmedDescription = description.trim();
      await apiClient.patch(`/api/v1/app/library/albums/${album.id}`, {
        title: title.trim(),
        description: trimmedDescription === '' ? null : trimmedDescription,
        artworkUrl,
      });

      logger.debug('[EditAlbumModal] Album updated successfully', { albumId: album.id });

      invalidateOnEvent(queryClient, { type: 'ALBUM_UPDATED', albumId: album.id });
      await queryClient.refetchQueries({ queryKey: queryKeys.albums.list() });
      await queryClient.refetchQueries({ queryKey: queryKeys.albums.detail(album.id) });
      logger.debug('[EditAlbumModal] Album cache invalidated and refetched');

      if (onSave) {
        await onSave();
      }
      onClose();
    } catch (err) {
      logger.error('[EditAlbumModal] Failed to update album', err);
      setError(t('editAlbum.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = title !== album.title || description !== (album.description || '') || newArtworkUri !== null;

  const displayArtworkUri = newArtworkUri || album.coverArtworkUrl;

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('editAlbum.title')}
      headerIcon="create-outline"
      testID="edit-album-modal"
      scrollable={true}
      avoidKeyboard={true}
      position="top"
    >
      <View style={styles.form}>
        <View style={styles.artworkSection}>
          <Text style={styles.label}>{t('editAlbum.artwork')}</Text>
          <TouchableOpacity
            style={styles.artworkPicker}
            onPress={pickArtwork}
            disabled={isSaving}
            testID="button-pick-album-artwork"
          >
            {displayArtworkUri ? (
              <Image source={{ uri: displayArtworkUri }} style={styles.artworkPreview} />
            ) : (
              <View style={styles.artworkPlaceholder}>
                <Ionicons name="library-outline" size={40} color={colors.text.tertiary} />
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
          <Text style={styles.artworkHint}>{t('editAlbum.tapToChangeArtwork')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editAlbum.albumName')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('editAlbum.albumNamePlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            testID="input-album-title"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editAlbum.description')}</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('editAlbum.descriptionPlaceholder')}
            placeholderTextColor={colors.text.tertiary}
            multiline
            numberOfLines={3}
            testID="input-album-description"
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            testID="button-cancel-album-edit"
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            testID="button-save-album"
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
      width: 120,
      height: 120,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
    },
    artworkPreview: {
      width: '100%',
      height: '100%',
      borderRadius: BORDER_RADIUS.md,
    },
    artworkPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
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
      borderRadius: BORDER_RADIUS.md,
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
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    multilineInput: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    errorText: {
      color: colors.semantic.error,
      fontSize: 14,
      textAlign: 'center',
    },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.darkCard,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.brand.primary,
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
