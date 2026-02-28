import { memo, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { PlaylistArtwork } from './PlaylistArtwork';
import { ArtworkImage } from '../shared/ArtworkImage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiRequest } from '../../lib/axiosApiClient';
import { useToast } from '../../hooks/ui/use-toast';
import { logError, getTranslatedFriendlyMessage } from '../../utils/errorSerialization';
import { getApiGatewayUrl, API_VERSION_PREFIX } from '../../lib/apiConfig';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../i18n';
import { usePlaylistMutations } from '../../hooks/playlists/usePlaylistMutations';
import { useAuthStore } from '../../auth/store';
import { LiquidGlassView } from '../ui';
import { useMediaPicker } from '../../hooks/ui/useMediaPicker';
import { invalidateOnEvent } from '../../lib/cacheManager';

interface PlaylistCardProps {
  id: string;
  title: string;
  description?: string;
  artworkUrl?: string;
  totalTracks: number;
  onPress: () => void;
  testID?: string;
  onArtworkGenerated?: (artworkUrl: string) => void;
  showMoreMenu?: boolean;
  canDelete?: boolean;
}

export const PlaylistCard = memo(
  function PlaylistCard({
    id,
    title,
    description,
    artworkUrl,
    totalTracks,
    onPress,
    testID,
    onArtworkGenerated,
    showMoreMenu = false,
    canDelete = true,
  }: PlaylistCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [localArtworkUrl, setLocalArtworkUrl] = useState(artworkUrl);
    const [moreMenuVisible, setMoreMenuVisible] = useState(false);
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [newName, setNewName] = useState(title);

    const {
      renamePlaylist,
      updatePlaylistArtwork,
      deletePlaylist,
      isRenamingPlaylist,
      isUpdatingArtwork,
      isDeletingPlaylist,
    } = usePlaylistMutations();

    const { pickMedia } = useMediaPicker({ aspect: [1, 1], quality: 0.8 });

    const generateArtworkMutation = useMutation({
      mutationFn: async (): Promise<ServiceResponse<{ artworkUrl?: string }>> => {
        return apiRequest(`/api/v1/app/playlists/${id}/generate-artwork`, {
          method: 'POST',
        }) as Promise<ServiceResponse<{ artworkUrl?: string }>>;
      },
      onSuccess: (response: ServiceResponse<{ artworkUrl?: string }>) => {
        logger.debug('Artwork generation response', { response });

        const artworkUrl = response?.data?.artworkUrl;

        if (artworkUrl) {
          logger.debug('Artwork URL extracted', { artworkUrl });
          setLocalArtworkUrl(artworkUrl);
          onArtworkGenerated?.(artworkUrl);
          invalidateOnEvent(queryClient, { type: 'PLAYLIST_ARTWORK_UPDATED', playlistId: id });
        } else {
          logger.error('No artwork URL in response', undefined, { response });
          toast({
            title: t('components.playlistCard.artworkGenerationFailed'),
            description: t('components.playlistCard.artworkDisplayError'),
            variant: 'destructive',
          });
        }
      },
      onError: error => {
        logger.error('Artwork generation error', error);
        const serialized = logError(error, 'Generate Playlist Artwork', `/api/v1/app/playlists/${id}/generate-artwork`);
        toast({
          title: t('components.playlistCard.artworkGenerationFailed'),
          description: getTranslatedFriendlyMessage(serialized, t),
          variant: 'destructive',
        });
      },
    });

    const handleGenerateArtwork = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      generateArtworkMutation.mutate();
    };

    const handleMorePress = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setMoreMenuVisible(true);
    };

    const handleRename = async () => {
      if (!newName.trim() || newName === title) {
        setRenameModalVisible(false);
        return;
      }
      try {
        await renamePlaylist({ playlistId: id, name: newName.trim() });
        setRenameModalVisible(false);
        setMoreMenuVisible(false);
      } catch (error) {
        logger.error('Failed to rename playlist', error);
      }
    };

    const handleChangeArtwork = async () => {
      setMoreMenuVisible(false);

      const result = await pickMedia();

      if (result) {
        try {
          const imageUri = result.uri;

          // Get auth token and userId for upload
          const token = useAuthStore.getState().token;
          const userId = useAuthStore.getState().user?.id;

          if (!userId) {
            throw new Error('User not authenticated');
          }

          // Upload image to storage first (same pattern as avatar upload)
          const uriParts = imageUri.split('/');
          const fileName = uriParts[uriParts.length - 1] || 'image.jpg';
          const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType =
            extension === 'png'
              ? 'image/png'
              : extension === 'gif'
                ? 'image/gif'
                : extension === 'webp'
                  ? 'image/webp'
                  : 'image/jpeg';

          const formData = new FormData();
          formData.append('file', {
            uri: imageUri,
            name: `playlist_${id}_${Date.now()}.${extension}`,
            type: mimeType,
            // as unknown as Blob: React Native FormData expects {uri,name,type} object cast to Blob
          } as unknown as Blob);
          formData.append('userId', userId);
          formData.append('isPublic', 'true');
          formData.append('category', 'playlist-artwork');
          formData.append('tags', JSON.stringify(['playlist', 'artwork']));

          const apiUrl = getApiGatewayUrl();

          logger.debug('Uploading playlist artwork', { playlistId: id });

          const uploadResult = await apiRequest<{
            success: boolean;
            data?: { url?: string; fileId?: string };
            error?: { message?: string };
          }>(`${API_VERSION_PREFIX}/storage/upload`, {
            method: 'POST',
            data: formData,
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (!uploadResult.success || !uploadResult.data) {
            throw new Error(uploadResult.error?.message || 'Upload returned no data');
          }

          let artworkUrl =
            uploadResult.data.url || `${API_VERSION_PREFIX}/storage/download/${uploadResult.data.fileId}`;
          if (artworkUrl.startsWith('/')) {
            artworkUrl = `${apiUrl}${artworkUrl}`;
          }

          logger.debug('Artwork uploaded, updating playlist', { artworkUrl });

          // Now update the playlist with the uploaded image URL
          await updatePlaylistArtwork({
            playlistId: id,
            artworkUrl,
          });
          setLocalArtworkUrl(artworkUrl);
        } catch (error) {
          logger.error('Failed to update artwork', error);
          const serialized = logError(error, 'Update Playlist Artwork', `${API_VERSION_PREFIX}/storage/upload`);
          toast({
            title: t('alerts.failedToUpdateArtwork'),
            description: getTranslatedFriendlyMessage(serialized, t),
            variant: 'destructive',
          });
        }
      }
    };

    const handleDelete = () => {
      setMoreMenuVisible(false);
      Alert.alert(t('components.playlistCard.deletePlaylist'), t('components.playlistCard.deletePlaylistConfirm'), [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlaylist({ playlistId: id });
            } catch (error) {
              logger.error('Failed to delete playlist', error);
            }
          },
        },
      ]);
    };

    const hasCustomArtwork =
      localArtworkUrl && (localArtworkUrl.startsWith('http') || localArtworkUrl.startsWith('/uploads'));

    return (
      <>
        <TouchableOpacity
          style={styles.container}
          onPress={onPress}
          activeOpacity={0.8}
          testID={testID || `playlist-card-${id}`}
        >
          <View style={styles.artworkContainer}>
            <ArtworkImage
              uri={hasCustomArtwork ? localArtworkUrl : undefined}
              size={160}
              borderRadius={BORDER_RADIUS.sm}
              fallbackIcon={<PlaylistArtwork playlistName={title} size={160} />}
            >
              <View style={styles.overlay}>
                <View style={styles.playButton}>
                  <Ionicons name="play" size={24} color={colors.text.primary} />
                </View>
              </View>
            </ArtworkImage>

            {!hasCustomArtwork && !generateArtworkMutation.isPending && (
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGenerateArtwork}
                testID={`generate-artwork-${id}`}
              >
                <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
              </TouchableOpacity>
            )}

            {showMoreMenu && (
              <TouchableOpacity style={styles.moreButton} onPress={handleMorePress} testID={`more-menu-${id}`}>
                <Ionicons name="ellipsis-vertical" size={18} color={colors.text.primary} />
              </TouchableOpacity>
            )}

            {generateArtworkMutation.isPending && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.brand.primary} />
                <Text style={styles.loadingText}>{t('components.playlistCard.generating')}</Text>
              </View>
            )}
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {description && (
              <Text style={styles.description} numberOfLines={2}>
                {description}
              </Text>
            )}
            <Text style={styles.trackCount}>{t('components.playlistCard.trackCount', { count: totalTracks })}</Text>
          </View>
        </TouchableOpacity>

        {/* More Menu Modal */}
        <Modal
          visible={moreMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setMoreMenuVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMoreMenuVisible(false)}>
            <LiquidGlassView intensity="strong" borderRadius={20} style={styles.menuContainer}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>{title}</Text>
                <TouchableOpacity onPress={() => setMoreMenuVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setNewName(title);
                  setRenameModalVisible(true);
                  setMoreMenuVisible(false);
                }}
                testID={`menu-rename-${id}`}
              >
                <Ionicons name="pencil-outline" size={22} color={colors.text.primary} />
                <Text style={styles.menuItemText}>{t('components.playlistCard.rename')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={handleChangeArtwork} testID={`menu-artwork-${id}`}>
                <Ionicons name="image-outline" size={22} color={colors.text.primary} />
                <Text style={styles.menuItemText}>{t('components.playlistCard.changeArtwork')}</Text>
              </TouchableOpacity>

              {canDelete && (
                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={handleDelete}
                  testID={`menu-delete-${id}`}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.semantic.error} />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                    {t('components.playlistCard.deletePlaylist')}
                  </Text>
                </TouchableOpacity>
              )}
            </LiquidGlassView>
          </TouchableOpacity>
        </Modal>

        {/* Rename Modal */}
        <Modal
          visible={renameModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setRenameModalVisible(false)}
            >
              <LiquidGlassView intensity="strong" borderRadius={20} style={styles.renameContainer}>
                <Text style={styles.renameTitle}>{t('components.playlistCard.renamePlaylist')}</Text>
                <TextInput
                  style={styles.renameInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t('components.playlistCard.playlistName')}
                  placeholderTextColor={colors.text.tertiary}
                  autoFocus
                  selectTextOnFocus
                />
                <View style={styles.renameActions}>
                  <TouchableOpacity style={styles.renameCancelButton} onPress={() => setRenameModalVisible(false)}>
                    <Text style={styles.renameCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.renameSaveButton,
                      (!newName.trim() || newName === title || isRenamingPlaylist) && styles.renameSaveButtonDisabled,
                    ]}
                    onPress={handleRename}
                    disabled={!newName.trim() || newName === title || isRenamingPlaylist}
                  >
                    {isRenamingPlaylist ? (
                      <ActivityIndicator size="small" color={colors.text.primary} />
                    ) : (
                      <Text style={styles.renameSaveText}>{t('common.save')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </LiquidGlassView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.id === nextProps.id &&
      prevProps.title === nextProps.title &&
      prevProps.description === nextProps.description &&
      prevProps.artworkUrl === nextProps.artworkUrl &&
      prevProps.totalTracks === nextProps.totalTracks &&
      prevProps.onPress === nextProps.onPress &&
      prevProps.onArtworkGenerated === nextProps.onArtworkGenerated &&
      prevProps.showMoreMenu === nextProps.showMoreMenu &&
      prevProps.canDelete === nextProps.canDelete &&
      prevProps.testID === nextProps.testID
    );
  }
);

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      width: 160,
      marginRight: 12,
    },
    artworkContainer: {
      width: 160,
      height: 160,
      borderRadius: BORDER_RADIUS.sm,
      overflow: 'hidden',
      backgroundColor: colors.background.secondary,
      position: 'relative',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[30],
      justifyContent: 'center',
      alignItems: 'center',
      opacity: 0,
    },
    playButton: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoContainer: {
      marginTop: 8,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    description: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 4,
      lineHeight: 18,
    },
    trackCount: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    generateButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.overlay.black[70],
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[80],
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: '600',
    },
    moreButton: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.overlay.black[70],
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[60],
      justifyContent: 'flex-end',
    },
    menuContainer: {
      paddingBottom: 32,
    },
    menuHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    menuTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      flex: 1,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 14,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text.primary,
      fontWeight: '500',
    },
    menuItemDanger: {
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
      marginTop: 8,
      paddingTop: 16,
    },
    menuItemTextDanger: {
      color: colors.semantic.error,
    },
    renameContainer: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 32,
    },
    renameTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 20,
    },
    renameInput: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text.primary,
      marginBottom: 20,
    },
    renameActions: {
      flexDirection: 'row',
      gap: 12,
    },
    renameCancelButton: {
      flex: 1,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    renameCancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    renameSaveButton: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    renameSaveButtonDisabled: {
      opacity: 0.5,
    },
    renameSaveText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
  });
