import { StyleSheet } from 'react-native';
import { type ColorScheme } from '../../theme';
import { Z_INDEX } from '../../theme/constants';

/**
 * Shared track display styles
 * Single source of truth for track item styling across all music screens
 */
export const createTrackStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    trackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    trackItemActive: {
      backgroundColor: colors.background.subtle,
    },

    artworkContainer: {
      position: 'relative',
      width: 56,
      height: 56,
      marginRight: 10,
    },

    playButtonOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: Z_INDEX.dropdown,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    playIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.state.hover,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    playIconActive: {
      backgroundColor: colors.brand.primary,
    },

    trackInfo: {
      flex: 1,
      marginRight: 8,
    },
    trackTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    trackSubtitle: {
      fontSize: 13,
      color: colors.text.tertiary,
      fontWeight: '400',
    },

    lyricsButton: {
      padding: 6,
      marginLeft: 4,
      marginRight: 2,
    },

    favoriteButton: {
      padding: 6,
      marginRight: 0,
    },

    trackDuration: {
      alignItems: 'flex-end',
      minWidth: 42,
    },
    trackDurationText: {
      fontSize: 14,
      color: colors.text.tertiary,
      fontWeight: '500',
    },
  });
