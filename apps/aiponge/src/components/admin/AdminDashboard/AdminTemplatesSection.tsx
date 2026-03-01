/**
 * Admin Templates Section
 * Manages journal templates and their translations for internationalization
 */

import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Modal } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { apiClient } from '@/lib/axiosApiClient';
import { SectionHeader, LoadingSection } from './shared';
import { ErrorState } from '../../shared/ErrorState';

interface LifeAreaTemplate {
  id: string;
  lifeAreaKey: string;
  chapterName: string;
  chapterType: string;
  entryQuestions: string[];
  playlistName: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateTranslation {
  id: string;
  templateId: string;
  locale: string;
  chapterName: string;
  entryQuestions: string[];
  playlistName: string;
}

interface LifeAreaSummary {
  lifeAreaKey: string;
  templateCount: number;
  activeCount: number;
  translationCoverage: Record<string, number>;
  supportedLocales: string[];
}

const LOCALE_LABELS: Record<string, string> = {
  'en-US': 'English',
  'fr-FR': 'French',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'pt-BR': 'Portuguese',
  'ja-JP': 'Japanese',
  ar: 'Arabic',
};

const LIFE_AREA_LABELS: Record<string, string> = {
  health_fitness: 'Health & Fitness',
  finance_career: 'Finance & Career',
  relationships: 'Relationships',
  personal_growth: 'Personal Growth',
  spirituality_mindfulness: 'Spirituality & Mindfulness',
  creativity_expression: 'Creativity & Expression',
  sleep_rest: 'Sleep & Rest',
  focus_productivity: 'Focus & Productivity',
};

export function AdminTemplatesSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LifeAreaSummary[]>([]);
  const [templates, setTemplates] = useState<LifeAreaTemplate[]>([]);
  const [selectedLifeArea, setSelectedLifeArea] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<LifeAreaTemplate | null>(null);
  const [translations, setTranslations] = useState<TemplateTranslation[]>([]);
  const [editingLocale, setEditingLocale] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    chapterName: '',
    entryQuestions: ['', '', ''],
    playlistName: '',
  });
  const [saving, setSaving] = useState(false);

  const [allTemplates, setAllTemplates] = useState<LifeAreaTemplate[]>([]);

  const loadAllTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{
        success: boolean;
        data: { templates: LifeAreaTemplate[]; total: number } | LifeAreaTemplate[];
      }>('/api/v1/librarian/templates');
      // Backend returns { templates: [...], total, offset, limit } under .data
      // Extract the array whether it's wrapped or directly an array
      const templates: LifeAreaTemplate[] = Array.isArray(response?.data)
        ? response.data
        : Array.isArray((response?.data as { templates?: unknown })?.templates)
          ? (response.data as { templates: LifeAreaTemplate[] }).templates
          : [];
      if (templates.length > 0) {
        setAllTemplates(templates);
        const grouped: Record<string, LifeAreaTemplate[]> = {};
        for (const t of templates) {
          const key = t.lifeAreaKey || (t as unknown as { contentType?: string }).contentType || 'unknown';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(t);
        }
        const derived: LifeAreaSummary[] = Object.entries(grouped).map(([key, items]) => ({
          lifeAreaKey: key,
          templateCount: items.length,
          activeCount: items.filter(i => i.isActive).length,
          translationCoverage: {},
          supportedLocales: Object.keys(LOCALE_LABELS),
        }));
        setSummary(derived);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplatesForArea = useCallback(
    (lifeAreaKey: string) => {
      const filtered = allTemplates.filter(t => t.lifeAreaKey === lifeAreaKey);
      setTemplates(filtered);
    },
    [allTemplates]
  );

  const loadTranslations = useCallback(async (templateId: string) => {
    try {
      const response = await apiClient.get<{ success: boolean; data: TemplateTranslation[] }>(
        `/api/v1/librarian/templates/${templateId}/translations`
      );
      if (response?.data) {
        setTranslations(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load translations');
    }
  }, []);

  useEffect(() => {
    loadAllTemplates();
  }, [loadAllTemplates]);

  useEffect(() => {
    if (selectedLifeArea) {
      loadTemplatesForArea(selectedLifeArea);
    }
  }, [selectedLifeArea, loadTemplatesForArea]);

  useEffect(() => {
    if (selectedTemplate) {
      loadTranslations(selectedTemplate.id);
    }
  }, [selectedTemplate, loadTranslations]);

  const handleEditTranslation = (locale: string) => {
    const existing = translations.find(t => t.locale === locale);
    if (existing) {
      setEditForm({
        chapterName: existing.chapterName,
        entryQuestions: [...existing.entryQuestions],
        playlistName: existing.playlistName,
      });
    } else if (selectedTemplate) {
      setEditForm({
        chapterName: selectedTemplate.chapterName,
        entryQuestions: [...selectedTemplate.entryQuestions],
        playlistName: selectedTemplate.playlistName,
      });
    }
    setEditingLocale(locale);
  };

  const handleSaveTranslation = async () => {
    if (!selectedTemplate || !editingLocale) return;

    try {
      setSaving(true);
      await apiClient.put(`/api/v1/librarian/templates/${selectedTemplate.id}/translations`, {
        locale: editingLocale,
        chapterName: editForm.chapterName,
        entryQuestions: editForm.entryQuestions.filter(q => q.trim() !== ''),
        playlistName: editForm.playlistName,
      });

      await loadTranslations(selectedTemplate.id);
      await loadAllTemplates();
      setEditingLocale(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save translation');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTranslation = async (locale: string) => {
    if (!selectedTemplate) return;
    if (locale === 'en-US') {
      Alert.alert('Error', 'Cannot delete English (default) translation');
      return;
    }

    Alert.alert('Delete Translation', `Are you sure you want to delete the ${LOCALE_LABELS[locale]} translation?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/api/v1/librarian/templates/${selectedTemplate.id}/translations/${locale}`);
            await loadTranslations(selectedTemplate.id);
            await loadAllTemplates();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete translation');
          }
        },
      },
    ]);
  };

  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const renderAreaPicker = () => {
    const selectedArea = summary.find(a => a.lifeAreaKey === selectedLifeArea);

    return (
      <View style={styles.pickerContainer}>
        <Text style={styles.pickerLabel}>{t('admin.templatesMgmt.lifeFocusArea')}</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowAreaPicker(true)}
          testID="dropdown-life-area"
        >
          <Text style={styles.pickerButtonText}>
            {selectedArea ? LIFE_AREA_LABELS[selectedArea.lifeAreaKey] : 'Select an area...'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={colors.text.secondary} />
        </TouchableOpacity>

        <Modal
          visible={showAreaPicker}
          animationType="fade"
          transparent
          onRequestClose={() => setShowAreaPicker(false)}
        >
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowAreaPicker(false)}>
            <View style={styles.pickerDropdown}>
              <Text style={styles.pickerDropdownTitle}>{t('admin.templatesMgmt.selectLifeFocusArea')}</Text>
              {summary.map(area => (
                <TouchableOpacity
                  key={area.lifeAreaKey}
                  style={[styles.pickerOption, selectedLifeArea === area.lifeAreaKey && styles.pickerOptionSelected]}
                  onPress={() => {
                    setSelectedLifeArea(area.lifeAreaKey);
                    setSelectedTemplate(null);
                    setTranslations([]);
                    setShowAreaPicker(false);
                  }}
                  testID={`option-area-${area.lifeAreaKey}`}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selectedLifeArea === area.lifeAreaKey && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {LIFE_AREA_LABELS[area.lifeAreaKey] || area.lifeAreaKey}
                  </Text>
                  <Text style={styles.pickerOptionStats}>
                    {area.activeCount}/{area.templateCount} active
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  };

  const renderTemplates = () => {
    if (!selectedLifeArea) return null;

    return (
      <View style={styles.templatesContainer}>
        <SectionHeader title={t('admin.templatesMgmt.title')} icon="document-outline" />
        {templates.map(template => (
          <TouchableOpacity
            key={template.id}
            style={[styles.templateCard, selectedTemplate?.id === template.id && styles.templateCardSelected]}
            onPress={() => setSelectedTemplate(template)}
            testID={`card-template-${template.id}`}
          >
            <View style={styles.templateHeader}>
              <Text style={styles.templateName}>{template.chapterName}</Text>
              <View style={[styles.statusBadge, template.isActive ? styles.activeBadge : styles.inactiveBadge]}>
                <Text style={styles.statusBadgeText}>{template.isActive ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <Text style={styles.templateType}>{template.chapterType}</Text>
            <Text style={styles.templateQuestions}>{template.entryQuestions.length} questions</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderTranslations = () => {
    if (!selectedTemplate) return null;

    return (
      <View style={styles.translationsContainer}>
        <SectionHeader title={t('admin.templatesMgmt.translations')} icon="language-outline" />
        <View style={styles.templatePreview}>
          <Text style={styles.previewLabel}>Original (English)</Text>
          <Text style={styles.previewChapter}>{selectedTemplate.chapterName}</Text>
          <Text style={styles.previewPlaylist}>Playlist: {selectedTemplate.playlistName}</Text>
          {selectedTemplate.entryQuestions.map((q, i) => (
            <Text key={i} style={styles.previewQuestion}>
              {i + 1}. {q}
            </Text>
          ))}
        </View>

        <View style={styles.localesGrid}>
          {Object.entries(LOCALE_LABELS).map(([locale, label]) => {
            const translation = translations.find(t => t.locale === locale);
            const hasTranslation = !!translation;

            return (
              <View key={locale} style={styles.localeCard}>
                <View style={styles.localeCardHeader}>
                  <Text style={styles.localeName}>{label}</Text>
                  <View style={[styles.statusDot, hasTranslation ? styles.statusDotGreen : styles.statusDotGray]} />
                </View>
                <View style={styles.localeActions}>
                  <TouchableOpacity
                    style={styles.localeButton}
                    onPress={() => handleEditTranslation(locale)}
                    testID={`button-edit-${locale}`}
                  >
                    <Ionicons
                      name={hasTranslation ? 'create-outline' : 'add-outline'}
                      size={18}
                      color={colors.brand.primary}
                    />
                    <Text style={styles.localeButtonText}>{hasTranslation ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                  {hasTranslation && locale !== 'en-US' && (
                    <TouchableOpacity
                      style={[styles.localeButton, styles.deleteButton]}
                      onPress={() => handleDeleteTranslation(locale)}
                      testID={`button-delete-${locale}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderEditModal = () => (
    <Modal visible={!!editingLocale} animationType="slide" transparent onRequestClose={() => setEditingLocale(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit {LOCALE_LABELS[editingLocale || ''] || ''} Translation</Text>
            <TouchableOpacity onPress={() => setEditingLocale(null)} testID="button-close-modal">
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalForm}>
            <Text style={styles.inputLabel}>{t('admin.templatesMgmt.chapterNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={editForm.chapterName}
              onChangeText={text => setEditForm(prev => ({ ...prev, chapterName: text }))}
              placeholder={t('admin.templatesMgmt.chapterName')}
              placeholderTextColor={colors.text.tertiary}
              testID="input-chapter-name"
            />

            <Text style={styles.inputLabel}>{t('admin.templatesMgmt.playlistNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={editForm.playlistName}
              onChangeText={text => setEditForm(prev => ({ ...prev, playlistName: text }))}
              placeholder={t('admin.templatesMgmt.playlistName')}
              placeholderTextColor={colors.text.tertiary}
              testID="input-playlist-name"
            />

            <Text style={styles.inputLabel}>{t('admin.templatesMgmt.entryQuestions')}</Text>
            {editForm.entryQuestions.map((question, index) => (
              <TextInput
                key={index}
                style={[styles.input, styles.questionInput]}
                value={question}
                onChangeText={text => {
                  const updated = [...editForm.entryQuestions];
                  updated[index] = text;
                  setEditForm(prev => ({ ...prev, entryQuestions: updated }));
                }}
                placeholder={`Question ${index + 1}`}
                placeholderTextColor={colors.text.tertiary}
                multiline
                testID={`input-question-${index}`}
              />
            ))}
            <TouchableOpacity
              style={styles.addQuestionButton}
              onPress={() => setEditForm(prev => ({ ...prev, entryQuestions: [...prev.entryQuestions, ''] }))}
              testID="button-add-question"
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.brand.primary} />
              <Text style={styles.addQuestionText}>{t('admin.templatesMgmt.addQuestion')}</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setEditingLocale(null)}
              testID="button-cancel"
            >
              <Text style={styles.cancelButtonText}>{t('admin.templatesMgmt.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton]}
              onPress={handleSaveTranslation}
              disabled={saving}
              testID="button-save"
            >
              <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return <LoadingSection />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadAllTemplates} fullScreen={false} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderAreaPicker()}
        {renderTemplates()}
        {renderTranslations()}
      </ScrollView>
      {renderEditModal()}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    pickerContainer: {
      marginBottom: 16,
    },
    pickerLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    pickerButton: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    pickerButtonText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    pickerDropdown: {
      backgroundColor: colors.background.dark,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      width: '100%',
      maxWidth: 400,
    },
    pickerDropdownTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    pickerOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 4,
    },
    pickerOptionSelected: {
      backgroundColor: colors.brand.purple[900],
    },
    pickerOptionText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    pickerOptionTextSelected: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    pickerOptionStats: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    summaryContainer: {
      marginBottom: 20,
    },
    areaCard: {
      backgroundColor: colors.background.darkCard,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
    },
    areaCardSelected: {
      borderWidth: 2,
      borderColor: colors.brand.primary,
    },
    areaCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    areaName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    areaStats: {
      flexDirection: 'row',
      gap: 8,
    },
    areaStatText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    translationCoverage: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
    },
    localeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.md,
      gap: 4,
    },
    localeComplete: {
      backgroundColor: colors.semantic.successLight,
    },
    localeIncomplete: {
      backgroundColor: colors.text.gray[200],
    },
    localeBadgeText: {
      fontSize: 10,
      fontWeight: '600',
    },
    localeBadgeCount: {
      fontSize: 10,
    },
    localeCompleteText: {
      color: colors.semantic.success,
    },
    localeIncompleteText: {
      color: colors.text.gray[600],
    },
    templatesContainer: {
      marginBottom: 20,
    },
    templateCard: {
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: 10,
      marginBottom: 8,
    },
    templateCardSelected: {
      borderWidth: 2,
      borderColor: colors.brand.primary,
    },
    templateHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    templateName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    activeBadge: {
      backgroundColor: colors.semantic.successLight,
    },
    inactiveBadge: {
      backgroundColor: colors.text.gray[200],
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.semantic.success,
    },
    templateType: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    templateQuestions: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginTop: 4,
    },
    translationsContainer: {
      marginBottom: 20,
    },
    templatePreview: {
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: 10,
      marginBottom: 12,
    },
    previewLabel: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 6,
    },
    previewChapter: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    previewPlaylist: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    previewQuestion: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
      paddingLeft: 8,
    },
    localesGrid: {
      gap: 8,
    },
    localeCard: {
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    localeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    localeName: {
      fontSize: 14,
      color: colors.text.primary,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.xs,
    },
    statusDotGreen: {
      backgroundColor: colors.semantic.success,
    },
    statusDotGray: {
      backgroundColor: colors.text.gray[400],
    },
    localeActions: {
      flexDirection: 'row',
      gap: 8,
    },
    localeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.background.primary,
      borderRadius: 6,
    },
    localeButtonText: {
      fontSize: 12,
      color: colors.brand.primary,
    },
    deleteButton: {
      paddingHorizontal: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalForm: {
      padding: 16,
    },
    inputLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      color: colors.text.primary,
      fontSize: 14,
    },
    questionInput: {
      marginBottom: 8,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    addQuestionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
    },
    addQuestionText: {
      fontSize: 14,
      color: colors.brand.primary,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.background.darkCard,
    },
    cancelButtonText: {
      color: colors.text.secondary,
      fontWeight: '600',
    },
    saveButton: {
      backgroundColor: colors.brand.primary,
    },
    saveButtonText: {
      color: colors.text.primary,
      fontWeight: '600',
    },
  });
