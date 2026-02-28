import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { BaseModal } from '../shared';

interface Playlist {
  id: string;
  name: string;
  description?: string;
  totalTracks: number;
}

interface PlaylistSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  playlists: Playlist[];
  trackId: string;
  trackTitle: string;
  onAddToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  isAdding?: boolean;
}

export function PlaylistSelectorModal({
  visible,
  onClose,
  playlists,
  trackId,
  trackTitle,
  onAddToPlaylist,
  isAdding = false,
}: PlaylistSelectorModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const handleAddToPlaylist = async (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    try {
      await onAddToPlaylist(playlistId, trackId);
      onClose();
    } finally {
      setSelectedPlaylistId(null);
    }
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={t('components.playlistSelector.addToPlaylist')}
      subtitle={trackTitle}
      closeTestID="close-playlist-selector"
      animationType="fade"
    >
      {playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="musical-notes-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyTitle}>{t('components.playlistSelector.noPlaylistsYet')}</Text>
          <Text style={styles.emptyText}>{t('components.playlistSelector.createPlaylistFirst')}</Text>
        </View>
      ) : (
        playlists.map(playlist => (
          <TouchableOpacity
            key={playlist.id}
            onPress={() => handleAddToPlaylist(playlist.id)}
            style={styles.playlistOption}
            testID={`add-to-playlist-${playlist.id}`}
            activeOpacity={0.7}
            disabled={isAdding && selectedPlaylistId === playlist.id}
          >
            <View style={styles.playlistOptionLeft}>
              <Ionicons name="list" size={24} color={colors.brand.primary} />
              <View style={styles.playlistOptionText}>
                <Text style={styles.playlistOptionName}>{playlist.name}</Text>
                {playlist.description && (
                  <Text style={styles.playlistOptionDescription} numberOfLines={1}>
                    {playlist.description}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.playlistOptionRight}>
              <View style={styles.playlistCountBadge}>
                <Text style={styles.playlistCountText}>{playlist.totalTracks}</Text>
              </View>
              {isAdding && selectedPlaylistId === playlist.id ? (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              ) : (
                <Ionicons name="add-circle" size={24} color={colors.brand.primary} />
              )}
            </View>
          </TouchableOpacity>
        ))
      )}
    </BaseModal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    playlistOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    playlistOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    playlistOptionText: {
      flex: 1,
    },
    playlistOptionName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    playlistOptionDescription: {
      fontSize: 13,
      color: colors.text.tertiary,
      lineHeight: 18,
    },
    playlistOptionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginLeft: 12,
    },
    playlistCountBadge: {
      backgroundColor: colors.state.hover,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
    },
    playlistCountText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    emptyContainer: {
      paddingVertical: 60,
      paddingHorizontal: 40,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
