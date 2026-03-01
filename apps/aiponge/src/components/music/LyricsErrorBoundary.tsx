/**
 * LyricsErrorBoundary — Catches crashes from useAudioPlayerStatus
 *
 * expo-audio's useAudioPlayerStatus hook accesses native player internals.
 * When the player has no source loaded (first render before audio loads) or
 * when using the iOS 26 StubAudioPlayer, the native reference is null and
 * the hook throws: "Cannot read property 'currentTime' of null".
 *
 * This boundary catches the crash at the lyrics level instead of letting it
 * propagate to the root ErrorBoundary, which would show "Something went wrong"
 * for the entire screen. The fallback shows static (non-synced) lyrics.
 */
import React, { Component, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { logger } from '../../lib/logger';
import { LiquidGlassCard } from '../ui';
import { i18n } from '../../i18n';

interface LyricsLine {
  text: string;
  type?: string;
}

interface LyricsErrorBoundaryProps {
  children: ReactNode;
  lyricsLines: LyricsLine[];
  containerStyle?: ViewStyle;
}

interface LyricsErrorBoundaryState {
  hasError: boolean;
}

export class LyricsErrorBoundary extends Component<LyricsErrorBoundaryProps, LyricsErrorBoundaryState> {
  state: LyricsErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LyricsErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    logger.warn('[LyricsErrorBoundary] Synced lyrics crashed, showing static fallback', {
      message: error.message,
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Static fallback — shows lyrics as plain text without time-sync
    const { lyricsLines, containerStyle } = this.props;
    const filteredLines = lyricsLines.filter(line => {
      if (line.type === 'section' || line.type === 'instrumental') return false;
      const trimmed = line.text.trim();
      if (/^\[.*\]$/.test(trimmed)) return false;
      return trimmed.replace(/\[.*?\]/g, '').trim().length > 0;
    });

    const title = (() => {
      try {
        return i18n.t('player.lyrics');
      } catch {
        return 'Lyrics';
      }
    })();

    return (
      <View style={containerStyle}>
        <LiquidGlassCard intensity="medium" padding={16} style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Ionicons name="musical-notes" size={18} color={colors.brand.primary} />
            <Text style={styles.cardTitle}>{title}</Text>
          </View>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {filteredLines.map((line, index) => (
              <View key={index} style={styles.lineContainer}>
                <Text style={styles.lineText}>{line.text.replace(/\[.*?\]/g, '').trim()}</Text>
              </View>
            ))}
          </ScrollView>
        </LiquidGlassCard>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 2,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: fontFamilies.body.semibold,
    color: colors.text.primary,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 4,
  },
  lineContainer: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  lineText: {
    color: colors.text.secondary,
    fontSize: 16,
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: '700',
    fontFamily: fontFamilies.body.bold,
  },
});
