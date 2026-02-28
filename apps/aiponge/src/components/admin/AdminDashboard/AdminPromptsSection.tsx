import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import {
  useAdminAIPromptTemplates,
  useAdminAIPromptCategories,
  useUpdateAIPromptTemplate,
  getVariableName,
  type AIPromptTemplate,
} from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection, createSharedStyles } from './shared';
import { logger } from '@/lib/logger';

export function AdminPromptsSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AIPromptTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editUserPrompt, setEditUserPrompt] = useState('');

  const categoriesQuery = useAdminAIPromptCategories();
  const templatesQuery = useAdminAIPromptTemplates(selectedCategory);
  const updateMutation = useUpdateAIPromptTemplate();

  const categories = categoriesQuery.data?.categories || [];
  const templates: AIPromptTemplate[] = templatesQuery.data?.templates || [];

  const handleSelectCategory = useCallback((category: string | undefined) => {
    setSelectedCategory(category);
    setShowCategoryPicker(false);
  }, []);

  const handleEditTemplate = useCallback((template: AIPromptTemplate) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditDescription(template.description || '');
    setEditSystemPrompt(template.systemPrompt || '');
    setEditUserPrompt(template.userPromptStructure || '');
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplate) return;

    try {
      await updateMutation.mutateAsync({
        id: editingTemplate.id,
        updates: {
          name: editName.trim(),
          description: editDescription.trim(),
          systemPrompt: editSystemPrompt.trim(),
          userPromptStructure: editUserPrompt.trim(),
        },
      });
      setEditingTemplate(null);
    } catch (error) {
      logger.error('[AdminPromptsSection] Failed to update template:', error instanceof Error ? error : undefined, {
        error,
      });
    }
  }, [editingTemplate, editName, editDescription, editSystemPrompt, editUserPrompt, updateMutation]);

  const handleCloseEditor = useCallback(() => {
    setEditingTemplate(null);
  }, []);

  const getCategoryLabel = (category: string) => {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <>
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.prompts.title')} icon="document-text-outline" />

        <TouchableOpacity
          style={styles.categorySelector}
          onPress={() => setShowCategoryPicker(true)}
          testID="button-category-selector"
        >
          <Ionicons name="filter-outline" size={18} color={colors.brand.primary} />
          <Text style={styles.categorySelectorText}>
            {selectedCategory ? getCategoryLabel(selectedCategory) : 'All Categories'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.text.tertiary} />
        </TouchableOpacity>

        {templatesQuery.isLoading ? (
          <LoadingSection />
        ) : templatesQuery.isError ? (
          <ErrorSection message={t('admin.prompts.failedToLoad')} />
        ) : templates.length > 0 ? (
          templates.map(template => (
            <TouchableOpacity
              key={template.id}
              style={styles.templateCard}
              onPress={() => handleEditTemplate(template)}
              testID={`card-template-${template.id}`}
            >
              <View style={styles.templateHeader}>
                <View style={styles.templateTitleRow}>
                  <Text style={styles.templateName} numberOfLines={1}>
                    {template.name}
                  </Text>
                  <View
                    style={[styles.statusIndicator, template.isActive ? styles.statusActive : styles.statusInactive]}
                  />
                </View>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{getCategoryLabel(template.category)}</Text>
                </View>
              </View>
              <Text style={styles.templateDescription} numberOfLines={2}>
                {template.description || 'No description'}
              </Text>
              <View style={styles.templateMeta}>
                {template.variables && template.variables.length > 0 && (
                  <View style={styles.metaItem}>
                    <Ionicons name="code-slash-outline" size={12} color={colors.text.tertiary} />
                    <Text style={styles.metaText}>{template.variables.length} vars</Text>
                  </View>
                )}
                {template.tags && template.tags.length > 0 && (
                  <View style={styles.metaItem}>
                    <Ionicons name="pricetags-outline" size={12} color={colors.text.tertiary} />
                    <Text style={styles.metaText}>{template.tags.length} tags</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} style={styles.editIcon} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={sharedStyles.emptyText}>{t('admin.prompts.noTemplatesInCategory')}</Text>
        )}
      </View>

      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <View style={styles.categoryPickerContainer}>
            <Text style={styles.categoryPickerTitle}>{t('admin.prompts.selectCategory')}</Text>
            <ScrollView style={styles.categoryList}>
              <TouchableOpacity
                style={[styles.categoryItem, !selectedCategory && styles.categoryItemActive]}
                onPress={() => handleSelectCategory(undefined)}
                testID="button-category-all"
              >
                <Text style={[styles.categoryItemText, !selectedCategory && styles.categoryItemTextActive]}>
                  All Categories
                </Text>
                {!selectedCategory && <Ionicons name="checkmark" size={18} color={colors.brand.primary} />}
              </TouchableOpacity>
              {categories.map(category => (
                <TouchableOpacity
                  key={category}
                  style={[styles.categoryItem, selectedCategory === category && styles.categoryItemActive]}
                  onPress={() => handleSelectCategory(category)}
                  testID={`button-category-${category}`}
                >
                  <Text
                    style={[styles.categoryItemText, selectedCategory === category && styles.categoryItemTextActive]}
                  >
                    {getCategoryLabel(category)}
                  </Text>
                  {selectedCategory === category && (
                    <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!editingTemplate} transparent animationType="slide" onRequestClose={handleCloseEditor}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.editorContainer}>
          <View style={styles.editorContent}>
            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>{t('admin.prompts.editPromptTemplate')}</Text>
              <TouchableOpacity onPress={handleCloseEditor} testID="button-close-editor">
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editorForm} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>{t('admin.prompts.fieldName')}</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder={t('admin.prompts.templateName')}
                  placeholderTextColor={colors.text.tertiary}
                  testID="input-template-name"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>{t('admin.prompts.fieldDescription')}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder={t('admin.prompts.templateDescription')}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={3}
                  testID="input-template-description"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>{t('admin.prompts.systemPrompt')}</Text>
                <TextInput
                  style={[styles.input, styles.largeTextArea]}
                  value={editSystemPrompt}
                  onChangeText={setEditSystemPrompt}
                  placeholder={t('admin.prompts.systemPromptPlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={6}
                  testID="input-template-system-prompt"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>{t('admin.prompts.userPromptStructure')}</Text>
                <TextInput
                  style={[styles.input, styles.largeTextArea]}
                  value={editUserPrompt}
                  onChangeText={setEditUserPrompt}
                  placeholder="User prompt structure with ${variables}"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  numberOfLines={6}
                  testID="input-template-user-prompt"
                />
              </View>

              {editingTemplate?.variables && editingTemplate.variables.length > 0 && (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>{t('admin.prompts.variables')}</Text>
                  <View style={styles.variablesContainer}>
                    {editingTemplate.variables.map((variable, index) => (
                      <View key={index} style={styles.variableTag}>
                        <Text style={styles.variableTagText}>
                          ${'{'}${getVariableName(variable)}
                          {'}'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.editorFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCloseEditor} testID="button-cancel-edit">
                <Text style={styles.cancelButtonText}>{t('admin.prompts.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, updateMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSaveTemplate}
                disabled={updateMutation.isPending}
                testID="button-save-template"
              >
                <Text style={styles.saveButtonText}>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    categorySelector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 12,
      gap: 8,
    },
    categorySelectorText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: '500',
    },
    templateCard: {
      backgroundColor: colors.background.darkCard,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
    },
    templateHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    templateTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 8,
    },
    templateName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
    },
    statusIndicator: {
      width: 8,
      height: 8,
      borderRadius: BORDER_RADIUS.xs,
    },
    statusActive: {
      backgroundColor: colors.semantic.success,
    },
    statusInactive: {
      backgroundColor: colors.semantic.error,
    },
    categoryBadge: {
      backgroundColor: colors.brand.primary + '25',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.xs,
    },
    categoryBadgeText: {
      fontSize: 10,
      color: colors.brand.primary,
      fontWeight: '600',
    },
    templateDescription: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 8,
      lineHeight: 18,
    },
    templateMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: 11,
      color: colors.text.tertiary,
    },
    editIcon: {
      marginLeft: 'auto',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryPickerContainer: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      width: '85%',
      maxHeight: '60%',
    },
    categoryPickerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    categoryList: {
      maxHeight: 300,
    },
    categoryItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 4,
    },
    categoryItemActive: {
      backgroundColor: colors.brand.primary + '20',
    },
    categoryItemText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    categoryItemTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    editorContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    editorContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    editorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    editorTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    editorForm: {
      padding: 16,
    },
    formField: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      fontSize: 14,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    largeTextArea: {
      minHeight: 140,
      textAlignVertical: 'top',
    },
    variablesContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    variableTag: {
      backgroundColor: colors.brand.primary + '30',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.xs,
    },
    variableTagText: {
      fontSize: 11,
      color: colors.brand.primary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    editorFooter: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: colors.background.darkCard,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    saveButton: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
  });
