/**
 * PromptViewer Component
 * Displays the AI prompts used to generate book content
 */

import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';

interface PromptViewerProps {
  systemPrompt: string | null;
  userPrompt: string | null;
}

export function PromptViewer({ systemPrompt, userPrompt }: PromptViewerProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'user'>('user');

  const hasPrompts = systemPrompt || userPrompt;

  if (!hasPrompts) {
    return null;
  }

  return (
    <>
      <TouchableOpacity style={styles.viewButton} onPress={() => setVisible(true)} testID="prompt-viewer-button">
        <Ionicons name="code-outline" size={16} color={colors.text.secondary} />
        <Text style={styles.viewButtonText}>{t('books.promptViewer.viewPrompt')}</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('books.promptViewer.promptTitle')}</Text>
            <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'user' && styles.tabActive]}
              onPress={() => setActiveTab('user')}
            >
              <Text style={[styles.tabText, activeTab === 'user' && styles.tabTextActive]}>
                {t('books.promptViewer.userPromptTab')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'system' && styles.tabActive]}
              onPress={() => setActiveTab('system')}
            >
              <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>
                {t('books.promptViewer.systemPromptTab')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.promptContainer}>
              <Text style={styles.promptText} selectable>
                {activeTab === 'user'
                  ? userPrompt || t('books.promptViewer.noPrompt')
                  : systemPrompt || t('books.promptViewer.noPrompt')}
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    viewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      alignSelf: 'flex-start',
    },
    viewButtonText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background.dark,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    closeButton: {
      padding: 4,
    },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
    },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.background.darkCard,
    },
    tabActive: {
      backgroundColor: colors.social.gold,
    },
    tabText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    tabTextActive: {
      color: colors.background.dark,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
    },
    promptContainer: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    promptText: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
  });
