import { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { AnimatedWaveform } from '../music/AnimatedWaveform';
import { ArtworkImage } from '../music/ArtworkImage';
import { useTranslation } from '../../i18n';

interface UserCreationCardProps {
  id: string;
  title: string;
  artworkUrl?: string;
  createdAt: string;
  duration: number;
  onPress: () => void;
  onLongPress?: () => void;
  isPlaying?: boolean;
  testID?: string;
}

export const UserCreationCard = memo(function UserCreationCard({
  id,
  title,
  artworkUrl,
  createdAt,
  duration,
  onPress,
  onLongPress,
  isPlaying = false,
  testID,
}: UserCreationCardProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const formatCreatedDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('common.today');
    if (diffDays === 1) return t('common.yesterday');
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      testID={testID || `user-creation-${id}`}
    >
      <ArtworkImage
        uri={artworkUrl}
        size={160}
        borderRadius={8}
        testID={`artwork-${id}`}
        placeholderTestId={`artwork-placeholder-${id}`}
        wrapperStyle={isPlaying ? { ...styles.artworkWrapper, ...styles.artworkWrapperPlaying } : styles.artworkWrapper}
        fallbackIcon={
          <LinearGradient
            colors={[colors.brand.pink, colors.brand.purple[400], colors.brand.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="musical-notes" size={40} color={colors.absolute.white} />
            </View>
          </LinearGradient>
        }
      >
        {isPlaying ? (
          <View style={styles.nowPlayingBadge}>
            <AnimatedWaveform size="small" color={colors.brand.primary} />
            <Text style={styles.nowPlayingText}>{t('components.userCreationCard.nowPlaying')}</Text>
          </View>
        ) : (
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={12} color={colors.social.gold} />
            <Text style={styles.badgeText}>{t('components.userCreationCard.youMadeThis')}</Text>
          </View>
        )}

        <View style={styles.overlay}>
          {isPlaying ? (
            <View style={styles.waveformButton}>
              <AnimatedWaveform size="large" color={colors.absolute.white} />
            </View>
          ) : (
            <View style={styles.playButton}>
              <Ionicons name="play" size={20} color={colors.absolute.white} />
            </View>
          )}
        </View>
      </ArtworkImage>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.metaContainer}>
          <Text style={styles.createdText}>{formatCreatedDate(createdAt)}</Text>
          <Text style={styles.duration}> • {formatDuration(duration)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      width: 160,
      marginRight: 12,
    },
    artworkWrapper: {
      borderWidth: 2,
      borderColor: 'transparent',
    },
    artworkWrapperPlaying: {
      borderColor: colors.brand.primary,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 12,
      elevation: 8,
    },
    badge: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.overlay.dark,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.absolute.white,
      marginLeft: 4,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[5],
      justifyContent: 'center',
      alignItems: 'center',
    },
    playButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 5,
    },
    waveformButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brand.purple[900],
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 8,
      elevation: 8,
    },
    nowPlayingBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.overlay.black[85],
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    nowPlayingText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.brand.primary,
      marginLeft: 6,
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
    metaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    createdText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    duration: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
  });
