import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { usePlaylistFollow } from '../../hooks/playlists/usePlaylistFollow';
import { useAuthStore, selectUser } from '../../auth/store';

interface FollowPlaylistButtonProps {
  playlistId: string;
  size?: 'small' | 'medium' | 'large';
  showCount?: boolean;
  variant?: 'filled' | 'outline' | 'minimal';
  testID?: string;
}

export function FollowPlaylistButton({
  playlistId,
  size = 'medium',
  showCount = true,
  variant = 'outline',
  testID = 'button-follow-playlist',
}: FollowPlaylistButtonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  const { isFollowing, followerCount, isLoading, toggleFollow, isToggling, canFollow } = usePlaylistFollow(
    playlistId,
    user?.id
  );

  const handlePress = () => {
    if (canFollow && !isToggling) {
      toggleFollow();
    }
  };

  const sizeStyles = {
    small: { paddingHorizontal: 10, paddingVertical: 4, iconSize: 14, fontSize: 12 },
    medium: { paddingHorizontal: 14, paddingVertical: 8, iconSize: 18, fontSize: 14 },
    large: { paddingHorizontal: 20, paddingVertical: 12, iconSize: 22, fontSize: 16 },
  };

  const currentSize = sizeStyles[size];

  const getButtonStyle = () => {
    const baseStyle = [
      styles.button,
      { paddingHorizontal: currentSize.paddingHorizontal, paddingVertical: currentSize.paddingVertical },
    ];

    if (variant === 'filled') {
      return [...baseStyle, isFollowing ? styles.filledFollowing : styles.filledNotFollowing];
    } else if (variant === 'outline') {
      return [...baseStyle, isFollowing ? styles.outlineFollowing : styles.outlineNotFollowing];
    }
    return [...baseStyle, styles.minimal];
  };

  const getTextColor = () => {
    if (variant === 'filled') {
      return isFollowing ? colors.text.primary : colors.text.dark;
    }
    return isFollowing ? colors.brand.primary : colors.text.primary;
  };

  const getIconColor = () => {
    if (variant === 'filled') {
      return isFollowing ? colors.brand.primary : colors.text.dark;
    }
    return isFollowing ? colors.brand.primary : colors.text.secondary;
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.button,
          styles.loading,
          { paddingHorizontal: currentSize.paddingHorizontal, paddingVertical: currentSize.paddingVertical },
        ]}
      >
        <ActivityIndicator size="small" color={colors.text.muted} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={handlePress}
      disabled={!canFollow || isToggling}
      testID={testID}
      activeOpacity={0.7}
    >
      {isToggling ? (
        <ActivityIndicator size="small" color={getIconColor()} />
      ) : (
        <>
          <Ionicons
            name={isFollowing ? 'checkmark-circle' : 'add-circle-outline'}
            size={currentSize.iconSize}
            color={getIconColor()}
          />
          <Text style={[styles.text, { color: getTextColor(), fontSize: currentSize.fontSize }]}>
            {isFollowing ? t('playlist.following') || 'Following' : t('playlist.follow') || 'Follow'}
          </Text>
          {showCount && followerCount > 0 && (
            <Text style={[styles.count, { fontSize: currentSize.fontSize - 2 }]}>{followerCount.toLocaleString()}</Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      gap: 6,
    },
    loading: {
      backgroundColor: colors.background.tertiary,
      opacity: 0.6,
    },
    filledFollowing: {
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    filledNotFollowing: {
      backgroundColor: colors.brand.primary,
    },
    outlineFollowing: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    outlineNotFollowing: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    minimal: {
      backgroundColor: 'transparent',
    },
    text: {
      fontWeight: '600',
    },
    count: {
      color: colors.text.muted,
      marginLeft: 2,
    },
  });

export default FollowPlaylistButton;
