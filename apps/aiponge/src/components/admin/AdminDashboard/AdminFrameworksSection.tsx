import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import {
  useFrameworks,
  FRAMEWORK_CATEGORIES,
  getCategoryColor,
  type PsychologicalFramework,
} from '@/hooks/profile/useFrameworks';
import { SectionHeader, createSharedStyles } from './shared';
import { LoadingState } from '../../shared';

type ViewMode = 'grid' | 'list';

export function AdminFrameworksSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const { frameworks, isLoading, error, refetch } = useFrameworks();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<PsychologicalFramework | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filteredFrameworks = useMemo(() => {
    if (!selectedCategory) return frameworks;
    return frameworks.filter(f => f.category === selectedCategory);
  }, [selectedCategory, frameworks]);

  const frameworkCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of frameworks) {
      counts[f.category] = (counts[f.category] || 0) + 1;
    }
    return counts;
  }, [frameworks]);

  const handleSelectCategory = useCallback((category: string | null) => {
    setSelectedCategory(prev => (prev === category ? null : category));
  }, []);

  const handleSelectFramework = useCallback((framework: PsychologicalFramework) => {
    setSelectedFramework(framework);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedFramework(null);
  }, []);

  if (isLoading) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.frameworks.title')} icon="git-branch-outline" />
        <LoadingState fullScreen={false} message={t('admin.frameworks.loading')} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.frameworks.title')} icon="git-branch-outline" />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.semantic.error} />
          <Text style={styles.errorText}>{t('admin.frameworks.failedToLoad')}</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Ionicons name="refresh" size={18} color={colors.text.primary} />
            <Text style={styles.retryButtonText}>{t('admin.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={sharedStyles.section}>
      <View style={styles.headerRow}>
        <SectionHeader title={t('admin.frameworks.title')} icon="git-branch-outline" />
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshButton} onPress={refetch}>
            <Ionicons name="refresh" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewToggleButton, viewMode === 'grid' && styles.viewToggleActive]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons
                name="grid-outline"
                size={18}
                color={viewMode === 'grid' ? colors.brand.primary : colors.text.secondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons
                name="list-outline"
                size={18}
                color={viewMode === 'list' ? colors.brand.primary : colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{frameworks.length}</Text>
          <Text style={styles.statLabel}>{t('admin.frameworks.totalFrameworks')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{frameworks.filter(f => f.enabled).length}</Text>
          <Text style={styles.statLabel}>{t('admin.frameworks.enabled')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{FRAMEWORK_CATEGORIES.length}</Text>
          <Text style={styles.statLabel}>{t('admin.frameworks.categories')}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryFilter}>
        <TouchableOpacity
          style={[styles.categoryChip, !selectedCategory && styles.categoryChipActive]}
          onPress={() => handleSelectCategory(null)}
        >
          <Text style={[styles.categoryChipText, !selectedCategory && styles.categoryChipTextActive]}>
            All ({frameworks.length})
          </Text>
        </TouchableOpacity>
        {FRAMEWORK_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive,
              { borderColor: cat.color },
            ]}
            onPress={() => handleSelectCategory(cat.id)}
          >
            <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
            <Text style={[styles.categoryChipText, selectedCategory === cat.id && styles.categoryChipTextActive]}>
              {cat.name} ({frameworkCounts[cat.id] || 0})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredFrameworks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyStateText}>{t('admin.frameworks.noFrameworksInCategory')}</Text>
          <TouchableOpacity style={styles.clearFilterButton} onPress={() => setSelectedCategory(null)}>
            <Text style={styles.clearFilterButtonText}>{t('admin.frameworks.showAllFrameworks')}</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'grid' ? (
        <View style={styles.frameworkGrid}>
          {filteredFrameworks.map(framework => (
            <TouchableOpacity
              key={framework.id}
              style={styles.frameworkCard}
              onPress={() => handleSelectFramework(framework)}
            >
              <View style={styles.frameworkCardHeader}>
                <View style={[styles.categoryIndicator, { backgroundColor: getCategoryColor(framework.category) }]} />
                <Text style={styles.frameworkShortName}>{framework.shortName}</Text>
                <View style={[styles.enabledBadge, !framework.enabled && styles.disabledBadge]}>
                  <Ionicons
                    name={framework.enabled ? 'checkmark-circle' : 'close-circle'}
                    size={14}
                    color={framework.enabled ? colors.semantic.success : colors.text.tertiary}
                  />
                </View>
              </View>
              <Text style={styles.frameworkName} numberOfLines={2}>
                {framework.name}
              </Text>
              <Text style={styles.frameworkDescription} numberOfLines={2}>
                {framework.description}
              </Text>
              <View style={styles.frameworkStats}>
                <Text style={styles.frameworkStatText}>{framework.keyPrinciples.length} principles</Text>
                <Text style={styles.frameworkStatDot}>•</Text>
                <Text style={styles.frameworkStatText}>{framework.triggerPatterns.length} triggers</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredFrameworks}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item: framework }) => (
            <TouchableOpacity style={styles.frameworkListItem} onPress={() => handleSelectFramework(framework)}>
              <View style={[styles.listCategoryIndicator, { backgroundColor: getCategoryColor(framework.category) }]} />
              <View style={styles.listItemContent}>
                <View style={styles.listItemHeader}>
                  <Text style={styles.listItemShortName}>{framework.shortName}</Text>
                  <Text style={styles.listItemName}>{framework.name}</Text>
                </View>
                <Text style={styles.listItemDescription} numberOfLines={1}>
                  {framework.description}
                </Text>
              </View>
              <View style={[styles.enabledBadge, !framework.enabled && styles.disabledBadge]}>
                <Ionicons
                  name={framework.enabled ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={framework.enabled ? colors.semantic.success : colors.text.tertiary}
                />
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!selectedFramework} animationType="slide" transparent={true} onRequestClose={handleCloseModal}>
        {selectedFramework && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <View
                    style={[
                      styles.modalCategoryIndicator,
                      { backgroundColor: getCategoryColor(selectedFramework.category) },
                    ]}
                  />
                  <View>
                    <Text style={styles.modalShortName}>{selectedFramework.shortName}</Text>
                    <Text style={styles.modalTitle}>{selectedFramework.name}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('admin.frameworks.description')}</Text>
                  <Text style={styles.modalDescription}>{selectedFramework.description}</Text>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('admin.frameworks.status')}</Text>
                  <View style={styles.statusRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        selectedFramework.enabled ? styles.statusEnabled : styles.statusDisabled,
                      ]}
                    >
                      <Ionicons
                        name={selectedFramework.enabled ? 'checkmark-circle' : 'close-circle'}
                        size={16}
                        color={selectedFramework.enabled ? colors.semantic.success : colors.semantic.error}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          selectedFramework.enabled ? styles.statusTextEnabled : styles.statusTextDisabled,
                        ]}
                      >
                        {selectedFramework.enabled ? 'Enabled' : 'Disabled'}
                      </Text>
                    </View>
                    <View style={styles.categoryBadge}>
                      <View
                        style={[styles.categoryDot, { backgroundColor: getCategoryColor(selectedFramework.category) }]}
                      />
                      <Text style={styles.categoryBadgeText}>
                        {FRAMEWORK_CATEGORIES.find(c => c.id === selectedFramework.category)?.name ||
                          selectedFramework.category}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('admin.frameworks.keyPrinciples')}</Text>
                  {selectedFramework.keyPrinciples.map((principle, index) => (
                    <View key={index} style={styles.bulletItem}>
                      <View style={styles.bullet} />
                      <Text style={styles.bulletText}>{principle}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('admin.frameworks.therapeuticGoals')}</Text>
                  <View style={styles.tagsContainer}>
                    {selectedFramework.therapeuticGoals.map((goal, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{goal.replace(/_/g, ' ')}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>{t('admin.frameworks.triggerPatterns')}</Text>
                  <View style={styles.tagsContainer}>
                    {selectedFramework.triggerPatterns.map((pattern, index) => (
                      <View key={index} style={styles.triggerTag}>
                        <Text style={styles.triggerTagText}>{pattern}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {selectedFramework.songStructureHint && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>{t('admin.frameworks.songStructureHint')}</Text>
                    <View style={styles.hintBox}>
                      <Ionicons name="musical-notes" size={16} color={colors.brand.primary} />
                      <Text style={styles.hintText}>{selectedFramework.songStructureHint}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    refreshButton: {
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.secondary,
    },
    viewToggle: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 4,
    },
    viewToggleButton: {
      padding: 8,
      borderRadius: 6,
    },
    viewToggleActive: {
      backgroundColor: colors.background.primary,
    },
    errorContainer: {
      alignItems: 'center',
      padding: 40,
      gap: 12,
    },
    errorText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.semantic.error,
    },
    errorSubtext: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 8,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.background.secondary,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
    },
    categoryFilter: {
      marginBottom: 16,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.background.secondary,
      borderRadius: 20,
      marginRight: 8,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    categoryChipActive: {
      backgroundColor: colors.brand.purple[100],
      borderColor: colors.brand.primary,
    },
    categoryChipText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    categoryChipTextActive: {
      color: colors.brand.primary,
    },
    categoryDot: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.xs,
      marginRight: 6,
    },
    frameworkGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    frameworkCard: {
      width: '48%',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      minHeight: 140,
    },
    frameworkCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    categoryIndicator: {
      width: 4,
      height: 24,
      borderRadius: 2,
      marginRight: 8,
    },
    frameworkShortName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      flex: 1,
    },
    enabledBadge: {
      padding: 2,
    },
    disabledBadge: {
      opacity: 0.5,
    },
    frameworkName: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    frameworkDescription: {
      fontSize: 11,
      color: colors.text.secondary,
      lineHeight: 16,
      flex: 1,
    },
    frameworkStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    frameworkStatText: {
      fontSize: 10,
      color: colors.text.tertiary,
    },
    frameworkStatDot: {
      fontSize: 10,
      color: colors.text.tertiary,
      marginHorizontal: 4,
    },
    frameworkListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginBottom: 8,
    },
    listCategoryIndicator: {
      width: 4,
      height: 40,
      borderRadius: 2,
      marginRight: 12,
    },
    listItemContent: {
      flex: 1,
    },
    listItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    listItemShortName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.brand.primary,
    },
    listItemName: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    listItemDescription: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.background.secondary,
    },
    modalTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    modalCategoryIndicator: {
      width: 6,
      height: 48,
      borderRadius: 3,
      marginRight: 12,
    },
    modalShortName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.brand.primary,
      marginBottom: 4,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      maxWidth: 260,
    },
    closeButton: {
      padding: 4,
    },
    modalBody: {
      padding: 20,
    },
    modalSection: {
      marginBottom: 20,
    },
    modalSectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    modalDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    statusRow: {
      flexDirection: 'row',
      gap: 12,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
    },
    statusEnabled: {
      backgroundColor: colors.semantic.successLight,
    },
    statusDisabled: {
      backgroundColor: colors.semantic.errorLight,
    },
    statusText: {
      fontSize: 13,
      fontWeight: '500',
    },
    statusTextEnabled: {
      color: colors.semantic.success,
    },
    statusTextDisabled: {
      color: colors.semantic.error,
    },
    categoryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.background.secondary,
      borderRadius: 20,
      gap: 6,
    },
    categoryBadgeText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    bulletItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    bullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.brand.primary,
      marginTop: 6,
      marginRight: 10,
    },
    bulletText: {
      fontSize: 14,
      color: colors.text.secondary,
      flex: 1,
      lineHeight: 20,
    },
    tagsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      backgroundColor: colors.brand.purple[100],
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
    },
    tagText: {
      fontSize: 12,
      color: colors.brand.primary,
      fontWeight: '500',
      textTransform: 'capitalize',
    },
    triggerTag: {
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.text.gray[300],
    },
    triggerTagText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    hintBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.brand.purple[100],
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      gap: 10,
    },
    hintText: {
      fontSize: 13,
      color: colors.brand.primary,
      flex: 1,
      lineHeight: 18,
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    clearFilterButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 8,
    },
    clearFilterButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
