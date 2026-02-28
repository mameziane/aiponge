import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { spacing } from '../../theme/spacing';
import { useTranslation } from '../../i18n';
import type { Playlist, RepeatMode } from '../../types';

export type { RepeatMode };

interface PlaylistDropdownProps {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  allTracksCount: number;
  onSelectPlaylist: (playlistId: string | null) => void;
  onCreatePlaylist?: (name: string, description?: string) => Promise<void>;
  isCreatingPlaylist?: boolean;
  // Playback controls
  shuffleEnabled?: boolean;
  repeatMode?: RepeatMode;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
  // Optional leading content (e.g., back button)
  leadingAccessory?: React.ReactNode;
  // Optional trailing content (e.g., follow button)
  trailingAccessory?: React.ReactNode;
}

export function PlaylistDropdown({
  playlists,
  selectedPlaylistId,
  allTracksCount,
  onSelectPlaylist,
  onCreatePlaylist,
  isCreatingPlaylist = false,
  shuffleEnabled = false,
  repeatMode = 'off',
  onToggleShuffle,
  onCycleRepeat,
  leadingAccessory,
  trailingAccessory,
}: PlaylistDropdownProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [playlistDropdownVisible, setPlaylistDropdownVisible] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');

  const getSelectedPlaylistName = () => {
    if (!selectedPlaylistId) return t('components.playlistDropdown.allTracks');
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    // Handle both 'name' and 'title' fields from different backend endpoints
    return playlist?.name || playlist?.title || t('components.playlistDropdown.allTracks');
  };

  const getSelectedPlaylistCount = () => {
    if (!selectedPlaylistId) return allTracksCount;
    const playlist = playlists.find(p => p.id === selectedPlaylistId);
    return playlist?.totalTracks || 0;
  };

  const handleSelectPlaylist = (playlistId: string | null) => {
    onSelectPlaylist(playlistId);
    setPlaylistDropdownVisible(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim() || !onCreatePlaylist) return;

    await onCreatePlaylist(newPlaylistName.trim(), newPlaylistDescription.trim() || undefined);

    // Reset form
    setNewPlaylistName('');
    setNewPlaylistDescription('');
    setShowCreateForm(false);
  };

  const handleCancelCreate = () => {
    setNewPlaylistName('');
    setNewPlaylistDescription('');
    setShowCreateForm(false);
  };

  // Always show the dropdown - it will display "All Tracks" even if no playlists exist
  return (
    <>
      {/* Playlist Selector Row */}
      <View style={styles.playlistSelectorContainer}>
        {/* Optional leading accessory (e.g., back button) */}
        {leadingAccessory && <View style={styles.leadingAccessoryContainer}>{leadingAccessory}</View>}

        {/* Playlist Selector Button */}
        <TouchableOpacity
          onPress={() => setPlaylistDropdownVisible(true)}
          style={styles.playlistDropdown}
          testID="playlist-dropdown-button"
          activeOpacity={0.7}
        >
          <View style={styles.playlistDropdownLeft}>
            <Ionicons name="list" size={20} color={colors.brand.primary} />
            <View style={styles.playlistDropdownTextContainer}>
              <Text style={styles.playlistDropdownLabel}>{t('components.playlistDropdown.playlist')}</Text>
              <Text style={styles.playlistDropdownValue}>{getSelectedPlaylistName()}</Text>
            </View>
          </View>
          <View style={styles.playlistDropdownRight}>
            <View style={styles.playlistCountBadge}>
              <Text style={styles.playlistCountText}>{getSelectedPlaylistCount()}</Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.brand.primary} />
          </View>
        </TouchableOpacity>

        {/* Optional trailing accessory (e.g., follow button) */}
        {trailingAccessory && <View style={styles.trailingAccessoryContainer}>{trailingAccessory}</View>}
      </View>

      {/* Playlist Selection Modal */}
      <Modal
        visible={playlistDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPlaylistDropdownVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPlaylistDropdownVisible(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('components.playlistDropdown.selectPlaylist')}</Text>
                <TouchableOpacity
                  onPress={() => setPlaylistDropdownVisible(false)}
                  style={styles.modalCloseButton}
                  testID="close-playlist-modal"
                >
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.playlistOptions}>
                {/* Create Playlist Button/Form */}
                {onCreatePlaylist && !showCreateForm && (
                  <TouchableOpacity
                    onPress={() => setShowCreateForm(true)}
                    style={styles.createPlaylistButton}
                    testID="button-create-playlist"
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle" size={24} color={colors.brand.primary} />
                    <Text style={styles.createPlaylistButtonText}>
                      {t('components.playlistDropdown.createNewPlaylist')}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Create Playlist Form */}
                {showCreateForm && (
                  <View style={styles.createPlaylistForm}>
                    <Text style={styles.createFormTitle}>{t('components.playlistDropdown.newPlaylist')}</Text>
                    <TextInput
                      style={styles.createFormInput}
                      placeholder={t('components.playlistDropdown.playlistName')}
                      placeholderTextColor={colors.text.tertiary}
                      value={newPlaylistName}
                      onChangeText={setNewPlaylistName}
                      autoFocus
                      testID="input-playlist-name"
                    />
                    <TextInput
                      style={[styles.createFormInput, styles.createFormTextarea]}
                      placeholder={t('components.playlistDropdown.descriptionOptional')}
                      placeholderTextColor={colors.text.tertiary}
                      value={newPlaylistDescription}
                      onChangeText={setNewPlaylistDescription}
                      multiline
                      numberOfLines={2}
                      testID="input-playlist-description"
                    />
                    <View style={styles.createFormActions}>
                      <TouchableOpacity
                        onPress={handleCancelCreate}
                        style={styles.createFormCancel}
                        testID="button-cancel-create"
                      >
                        <Text style={styles.createFormCancelText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCreatePlaylist}
                        style={[
                          styles.createFormSubmit,
                          (!newPlaylistName.trim() || isCreatingPlaylist) && styles.createFormSubmitDisabled,
                        ]}
                        disabled={!newPlaylistName.trim() || isCreatingPlaylist}
                        testID="button-submit-create"
                      >
                        {isCreatingPlaylist ? (
                          <Text style={styles.createFormSubmitText}>{t('components.playlistDropdown.creating')}</Text>
                        ) : (
                          <Text style={styles.createFormSubmitText}>{t('common.create')}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* All Tracks Option - only show when tracks exist */}
                {allTracksCount > 0 && (
                  <TouchableOpacity
                    onPress={() => handleSelectPlaylist(null)}
                    style={[styles.playlistOption, !selectedPlaylistId && styles.playlistOptionActive]}
                    testID="playlist-option-all"
                    activeOpacity={0.7}
                  >
                    <View style={styles.playlistOptionLeft}>
                      <Ionicons
                        name={!selectedPlaylistId ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={!selectedPlaylistId ? colors.brand.primary : colors.text.tertiary}
                      />
                      <View style={styles.playlistOptionText}>
                        <Text
                          style={[styles.playlistOptionName, !selectedPlaylistId && styles.playlistOptionNameActive]}
                        >
                          {t('components.playlistDropdown.allTracks')}
                        </Text>
                        <Text style={styles.playlistOptionDescription}>
                          {t('components.playlistDropdown.completeLibrary')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.playlistOptionBadge}>
                      <Text style={styles.playlistOptionCount}>{allTracksCount}</Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Individual Playlists */}
                {playlists.map(playlist => (
                  <TouchableOpacity
                    key={playlist.id}
                    onPress={() => handleSelectPlaylist(playlist.id)}
                    style={[styles.playlistOption, selectedPlaylistId === playlist.id && styles.playlistOptionActive]}
                    testID={`playlist-option-${playlist.id}`}
                    activeOpacity={0.7}
                  >
                    <View style={styles.playlistOptionLeft}>
                      <Ionicons
                        name={selectedPlaylistId === playlist.id ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={selectedPlaylistId === playlist.id ? colors.brand.primary : colors.text.tertiary}
                      />
                      <View style={styles.playlistOptionText}>
                        <Text
                          style={[
                            styles.playlistOptionName,
                            selectedPlaylistId === playlist.id && styles.playlistOptionNameActive,
                          ]}
                        >
                          {playlist.name || playlist.title}
                        </Text>
                        {playlist.description && (
                          <Text style={styles.playlistOptionDescription} numberOfLines={1}>
                            {playlist.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.playlistOptionBadge}>
                      <Text style={styles.playlistOptionCount}>{playlist.totalTracks}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    playlistSelectorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.screenHorizontal,
      paddingVertical: spacing.componentGap,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
      gap: spacing.componentGap,
    },
    leadingAccessoryContainer: {
      justifyContent: 'center',
    },
    trailingAccessoryContainer: {
      justifyContent: 'center',
      marginLeft: 8,
    },
    playlistDropdown: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    playlistDropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    playlistDropdownTextContainer: {
      flex: 1,
    },
    playlistDropdownLabel: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 2,
      fontWeight: '500',
    },
    playlistDropdownValue: {
      fontSize: 15,
      color: colors.text.primary,
      fontWeight: '600',
    },
    playlistDropdownRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    playlistCountBadge: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
    },
    playlistCountText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border.muted,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modalCloseButton: {
      padding: 4,
    },
    playlistOptions: {
      paddingVertical: 8,
    },
    playlistOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    playlistOptionActive: {
      backgroundColor: colors.background.subtle,
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
    playlistOptionNameActive: {
      color: colors.brand.primary,
    },
    playlistOptionDescription: {
      fontSize: 13,
      color: colors.text.tertiary,
      lineHeight: 18,
    },
    playlistOptionBadge: {
      backgroundColor: colors.state.hover,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
      marginLeft: 12,
    },
    playlistOptionCount: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    createPlaylistButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
      backgroundColor: colors.background.subtle,
    },
    createPlaylistButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    createPlaylistForm: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: colors.background.subtle,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    createFormTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 16,
    },
    createFormInput: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text.primary,
      marginBottom: 12,
    },
    createFormTextarea: {
      height: 60,
      textAlignVertical: 'top',
    },
    createFormActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    createFormCancel: {
      flex: 1,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    createFormCancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    createFormSubmit: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 12,
      alignItems: 'center',
    },
    createFormSubmitDisabled: {
      opacity: 0.5,
    },
    createFormSubmitText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
  });
