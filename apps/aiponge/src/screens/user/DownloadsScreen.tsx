/**
 * Downloads Screen
 * Displays all offline downloaded content with management options
 */

import { useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles } from '../../theme';
import { useDownloadStore } from '../../offline/store';
import { useOfflineDownload } from '../../offline/useOfflineDownload';
import { useTrackPlayback, type PlayableTrack } from '../../hooks/music/useTrackPlayback';
import { ArtworkImage } from '../../components/music/ArtworkImage';
import { AnimatedWaveform } from '../../components/music/AnimatedWaveform';
import { UnifiedHeader } from '../../components/shared/UnifiedHeader';
import { LiquidGlassCard, LiquidGlassView } from '../../components/ui';
import { EmptyState } from '../../components/shared/EmptyState';
import type { OfflineTrack, DownloadStatus } from '../../offline/types';

interface DownloadItemProps {
  item: OfflineTrack;
  isPlaying: boolean;
  isActive: boolean;
  onPress: () => void;
  onRemove: () => void;
  formatDuration: (seconds: number) => string;
  formatSize: (bytes: number) => string;
}

function DownloadItem({ item, isPlaying, isActive, onPress, onRemove, formatDuration, formatSize }: DownloadItemProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const getStatusIcon = (status: DownloadStatus) => {
    switch (status) {
      case 'completed':
        return { name: 'checkmark-circle' as const, color: colors.semantic.success };
      case 'downloading':
        return { name: 'cloud-download' as const, color: colors.brand.primary };
      case 'pending':
        return { name: 'time-outline' as const, color: colors.text.secondary };
      case 'paused':
        return { name: 'pause-circle-outline' as const, color: colors.text.secondary };
      case 'failed':
        return { name: 'alert-circle-outline' as const, color: colors.semantic.error };
      default:
        return { name: 'cloud-offline-outline' as const, color: colors.text.secondary };
    }
  };

  const statusIcon = getStatusIcon(item.status);

  return (
    <TouchableOpacity
      style={[styles.downloadItem, isActive && styles.downloadItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={item.status !== 'completed'}
      testID={`download-item-${item.id}`}
    >
      <ArtworkImage
        uri={item.localArtworkPath || item.artworkUrl}
        size={56}
        borderRadius={6}
        testID={`artwork-${item.id}`}
        wrapperStyle={styles.artworkWrapper}
        fallbackIcon={<Ionicons name="musical-note" size={20} color={colors.brand.primary} />}
      >
        {isPlaying && (
          <View style={styles.playingOverlay}>
            <AnimatedWaveform size="small" color={colors.absolute.white} />
          </View>
        )}
      </ArtworkImage>

      <View style={styles.infoContainer}>
        <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.displayNameText} numberOfLines={1}>
          {item.displayName}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name={statusIcon.name} size={14} color={statusIcon.color} />
          <Text style={styles.metaText}>
            {item.status === 'downloading'
              ? `${Math.round(item.progress * 100)}%`
              : item.status === 'completed'
                ? formatSize(item.size)
                : item.status}
          </Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{formatDuration(item.duration)}</Text>
        </View>
      </View>

      {item.status === 'completed' && (
        <TouchableOpacity
          onPress={onRemove}
          style={styles.removeButton}
          testID={`button-remove-${item.id}`}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export function DownloadsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { downloads, storageInfo, removeDownload, refreshStorageInfo, getCompletedDownloads, isOfflineSupported } =
    useOfflineDownload();
  const clearAllDownloads = useDownloadStore(state => state.clearAllDownloads);

  // Show Expo Go message if offline downloads are not supported
  if (!isOfflineSupported) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <UnifiedHeader title={t('downloads.title', 'Downloads')} />
        <View style={styles.expoGoState}>
          <View style={styles.expoGoIconContainer}>
            <Ionicons name="construct-outline" size={48} color={colors.brand.primary} />
          </View>
          <Text style={styles.expoGoTitle}>{t('downloads.devBuildRequired', 'Development Build Required')}</Text>
          <Text style={styles.expoGoMessage}>
            {t(
              'downloads.expoGoMessage',
              'Offline downloads require a development build. This feature is not available in Expo Go.'
            )}
          </Text>
          <LiquidGlassCard intensity="light" padding={12} borderRadius={8}>
            <View style={styles.expoGoInfoContent}>
              <Ionicons name="information-circle-outline" size={16} color={colors.text.tertiary} />
              <Text style={styles.expoGoInfoText}>
                {t('downloads.expoGoHint', 'Create a development build with EAS to enable offline playback.')}
              </Text>
            </View>
          </LiquidGlassCard>
        </View>
      </SafeAreaView>
    );
  }

  const downloadList = useMemo(() => {
    return Object.values(downloads).sort((a, b) => {
      // Completed first, then by download date
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (b.status === 'completed' && a.status !== 'completed') return 1;
      return (b.downloadedAt || 0) - (a.downloadedAt || 0);
    });
  }, [downloads]);

  const completedTracks = useMemo(() => {
    return downloadList
      .filter(d => d.status === 'completed' && d.localAudioPath)
      .map(d => ({
        id: d.trackId,
        audioUrl: d.localAudioPath!,
        title: d.title,
        displayName: d.displayName,
        artworkUrl: d.localArtworkPath || d.artworkUrl,
        duration: d.duration,
      }));
  }, [downloadList]);

  const { currentTrack, isPlaying, handlePlayTrack } = useTrackPlayback<PlayableTrack>({
    availableTracks: completedTracks,
  });

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatSize = useCallback((bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }, []);

  const handlePlay = useCallback(
    (item: OfflineTrack) => {
      if (item.status !== 'completed' || !item.localAudioPath) return;

      const track: PlayableTrack = {
        id: item.trackId,
        audioUrl: item.localAudioPath,
        title: item.title,
        displayName: item.displayName,
        duration: item.duration,
        artworkUrl: item.localArtworkPath || item.artworkUrl,
      };
      handlePlayTrack(track);
    },
    [handlePlayTrack]
  );

  const handleRemove = useCallback(
    (trackId: string) => {
      Alert.alert(
        t('downloads.removeTitle', 'Remove Download'),
        t('downloads.removeMessage', 'Are you sure you want to remove this downloaded track?'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('common.remove', 'Remove'),
            style: 'destructive',
            onPress: () => removeDownload(trackId),
          },
        ]
      );
    },
    [t, removeDownload]
  );

  const handleClearAll = useCallback(() => {
    Alert.alert(
      t('downloads.clearAllTitle', 'Clear All Downloads'),
      t('downloads.clearAllMessage', 'This will remove all downloaded tracks. Are you sure?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.clearAll', 'Clear All'),
          style: 'destructive',
          onPress: () => clearAllDownloads(),
        },
      ]
    );
  }, [t, clearAllDownloads]);

  const renderItem = useCallback(
    ({ item }: { item: OfflineTrack }) => (
      <DownloadItem
        item={item}
        isPlaying={currentTrack?.id === item.trackId && isPlaying}
        isActive={currentTrack?.id === item.trackId}
        onPress={() => handlePlay(item)}
        onRemove={() => handleRemove(item.trackId)}
        formatDuration={formatDuration}
        formatSize={formatSize}
      />
    ),
    [currentTrack, isPlaying, handlePlay, handleRemove, formatDuration, formatSize]
  );

  const keyExtractor = useCallback((item: OfflineTrack) => item.id, []);

  const storagePercentage = storageInfo.limitBytes > 0 ? (storageInfo.usedBytes / storageInfo.limitBytes) * 100 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <UnifiedHeader title={t('downloads.title', 'Downloads')} />

      {/* Storage Info */}
      <LiquidGlassCard intensity="medium" padding={16} style={styles.storageCard}>
        <View style={styles.storageHeader}>
          <View style={styles.storageLeft}>
            <Ionicons name="cloud-download" size={20} color={colors.brand.primary} />
            <Text style={styles.storageTitle}>{t('downloads.storage', 'Storage Used')}</Text>
          </View>
          <Text style={styles.storageValue}>
            {formatSize(storageInfo.usedBytes)} / {formatSize(storageInfo.limitBytes)}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(storagePercentage, 100)}%`,
                backgroundColor:
                  storagePercentage > 90
                    ? colors.semantic.error
                    : storagePercentage > 70
                      ? colors.semantic.warning
                      : colors.brand.primary,
              },
            ]}
          />
        </View>
        <Text style={styles.trackCount}>
          {t('downloads.trackCount', '{{count}} tracks downloaded', {
            count: storageInfo.totalTracks,
          })}
        </Text>
      </LiquidGlassCard>

      {/* Download List */}
      {downloadList.length > 0 ? (
        <FlatList
          data={downloadList}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refreshStorageInfo} tintColor={colors.brand.primary} />
          }
          ListFooterComponent={
            downloadList.length > 0 ? (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={handleClearAll}
                testID="button-clear-all-downloads"
              >
                <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
                <Text style={styles.clearAllText}>{t('downloads.clearAll', 'Clear All Downloads')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <EmptyState
          icon="cloud-download-outline"
          title={t('downloads.emptyTitle', 'No Downloads Yet')}
          description={t(
            'downloads.emptyMessage',
            'Download songs to listen offline. Tap the download icon on any track to get started.'
          )}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    storageCard: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 16,
    },
    storageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    storageLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    storageTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    storageValue: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.background.subtle,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
    },
    trackCount: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
    listContent: {
      paddingBottom: 100,
    },
    downloadItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: 'transparent',
    },
    downloadItemActive: {
      backgroundColor: 'rgba(68, 9, 114, 0.08)',
      borderLeftWidth: 3,
      borderLeftColor: colors.brand.primary,
    },
    artworkWrapper: {
      marginRight: 12,
      borderRadius: 6,
      overflow: 'hidden',
    },
    playingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(68, 9, 114, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoContainer: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 2,
    },
    titleActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    displayNameText: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    metaDot: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    removeButton: {
      padding: 8,
    },
    clearAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 24,
      marginBottom: 16,
      paddingVertical: 12,
    },
    clearAllText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.semantic.error,
    },
    expoGoState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    expoGoIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(68, 9, 114, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    expoGoTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    expoGoMessage: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    expoGoInfoContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    expoGoInfoText: {
      flex: 1,
      fontSize: 13,
      color: colors.text.tertiary,
      lineHeight: 18,
    },
  });
