import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

interface WorkInProgressTileProps {
  id: string;
  title: string;
  status: 'draft' | 'processing' | 'pending';
  updatedAt: string;
  onPress: () => void;
  testID?: string;
}

export function WorkInProgressTile({ id, title, status, updatedAt, onPress, testID }: WorkInProgressTileProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) return t('time.justNow');
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes });

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays });

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusInfo = () => {
    switch (status) {
      case 'processing':
        return {
          icon: 'sync' as const,
          text: t('components.workInProgress.generating'),
          color: colors.semantic.info,
        };
      case 'pending':
        return {
          icon: 'time' as const,
          text: t('components.workInProgress.pending'),
          color: colors.semantic.warning,
        };
      case 'draft':
      default:
        return {
          icon: 'create' as const,
          text: t('components.workInProgress.draft'),
          color: colors.text.secondary,
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID || `work-in-progress-${id}`}
    >
      <View style={styles.iconContainer}>
        {status === 'processing' ? (
          <ActivityIndicator size="small" color={statusInfo.color} />
        ) : (
          <Ionicons name={statusInfo.icon} size={20} color={statusInfo.color} />
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title || t('components.workInProgress.untitled')}
        </Text>
        <View style={styles.metaContainer}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          <Text style={styles.separator}> • </Text>
          <Text style={styles.timeText}>{formatDate(updatedAt)}</Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: 'rgba(162, 128, 188, 0.08)',
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: 'rgba(162, 128, 188, 0.2)',
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    infoContainer: {
      flex: 1,
      marginRight: 12,
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
    statusText: {
      fontSize: 13,
      fontWeight: '500',
    },
    separator: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
    timeText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    actionContainer: {
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
