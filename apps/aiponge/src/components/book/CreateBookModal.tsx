import { useState, useEffect, useCallback, useMemo, type ComponentProps } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import { BookGeneratorModal } from './BookGeneratorModal';
import type { GeneratedBookBlueprint } from '../../hooks/book/useBookGenerator';
import {
  getBookTypeConfig,
  BOOK_TYPE_IDS,
  BOOK_TYPES_SORTED,
  BOOK_TYPE_CATEGORY_CONFIGS,
  getBookTypesForCategory,
  resolveBookTypeColor,
  type BookTypeId,
  type BookTypeConfig,
  type BookTypeCategoryConfig,
  type BookTypeCategory,
} from '../../constants/bookTypes';

export interface BookTemplate {
  key: string;
  label: string;
  description?: string;
}

interface CreateBookModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateFromBlueprint: (blueprint: GeneratedBookBlueprint, bookTypeId?: string) => Promise<void>;
  onQuickCreate?: (templateKey?: string) => Promise<void>;
  templates?: BookTemplate[];
  onLoadTemplates?: () => Promise<void>;
  bookTypeId?: BookTypeId;
  canQuickCreate?: boolean;
}

type ModalStep = 'pick-category' | 'pick-type' | 'create';

function CategoryTile({
  config,
  typeCount,
  onPress,
}: {
  config: BookTypeCategoryConfig;
  typeCount: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const typePickerStyles = useMemo(() => createTypePickerStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={typePickerStyles.tile}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`book-category-tile-${config.id}`}
    >
      <View style={[typePickerStyles.tileIconWrap, { backgroundColor: colors.brand.primary + '15' }]}>
        <Ionicons
          name={config.icon as ComponentProps<typeof Ionicons>['name']}
          size={24}
          color={colors.brand.primary}
        />
      </View>
      <Text style={typePickerStyles.tileName} numberOfLines={1}>
        {t(config.nameKey)}
      </Text>
      <Text style={typePickerStyles.tileDesc} numberOfLines={2}>
        {t(config.descriptionKey)}
      </Text>
      <Text style={typePickerStyles.tileCount}>
        {typeCount} {typeCount === 1 ? t('common.type', 'type') : t('common.types', 'types')}
      </Text>
    </TouchableOpacity>
  );
}

function BookTypeTile({ config, onPress }: { config: BookTypeConfig; onPress: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const typePickerStyles = useMemo(() => createTypePickerStyles(colors), [colors]);
  const accentColor = resolveBookTypeColor(config.colorKey, colors);

  return (
    <TouchableOpacity
      style={typePickerStyles.tile}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`book-type-tile-${config.id}`}
    >
      <View style={[typePickerStyles.tileIconWrap, { backgroundColor: accentColor + '20' }]}>
        <Ionicons name={config.icon as ComponentProps<typeof Ionicons>['name']} size={24} color={accentColor} />
      </View>
      <Text style={typePickerStyles.tileName} numberOfLines={1}>
        {t(config.nameKey)}
      </Text>
      <Text style={typePickerStyles.tileDesc} numberOfLines={2}>
        {t(config.descriptionKey)}
      </Text>
    </TouchableOpacity>
  );
}

export function CreateBookModal({
  visible,
  onClose,
  onCreateFromBlueprint,
  onQuickCreate,
  templates,
  onLoadTemplates,
  bookTypeId = BOOK_TYPE_IDS.PERSONAL,
  canQuickCreate = false,
}: CreateBookModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typePickerStyles = useMemo(() => createTypePickerStyles(colors), [colors]);
  const [step, setStep] = useState<ModalStep>('pick-category');
  const [selectedCategory, setSelectedCategory] = useState<BookTypeCategory | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<BookTypeId>(bookTypeId);
  const bookTypeConfig = getBookTypeConfig(selectedTypeId);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const filteredBookTypes = useMemo(
    () => (selectedCategory ? getBookTypesForCategory(selectedCategory) : BOOK_TYPES_SORTED),
    [selectedCategory]
  );

  useEffect(() => {
    if (visible && onLoadTemplates && (!templates || templates.length === 0)) {
      onLoadTemplates();
    }
  }, [visible, onLoadTemplates, templates?.length]);

  useEffect(() => {
    if (!visible) {
      setShowGenerator(false);
      setIsSubmitting(false);
      setSelectedTemplate(null);
      setStep('pick-category');
      setSelectedCategory(null);
      setSelectedTypeId(bookTypeId);
    }
  }, [visible]);

  const handleCloseGenerator = useCallback(() => {
    setShowGenerator(false);
  }, []);

  const handleCreateBook = useCallback(
    (blueprint: GeneratedBookBlueprint) => {
      return onCreateFromBlueprint(blueprint, selectedTypeId);
    },
    [onCreateFromBlueprint, selectedTypeId]
  );

  const handleSelectCategory = (category: BookTypeCategory) => {
    setSelectedCategory(category);
    setStep('pick-type');
  };

  const handleSelectType = (typeId: BookTypeId) => {
    setSelectedTypeId(typeId);
    const config = getBookTypeConfig(typeId);
    if (config.canQuickCreate) {
      setStep('create');
    } else {
      onClose();
      setTimeout(() => {
        setSelectedTypeId(typeId);
        setShowGenerator(true);
      }, 100);
    }
  };

  const handleBackToCategories = () => {
    setStep('pick-category');
    setSelectedCategory(null);
  };

  const handleBackToTypePicker = () => {
    setStep('pick-type');
  };

  const handleOpenGenerator = () => {
    onClose();
    setShowGenerator(true);
  };

  const handleQuickCreate = async (templateKey?: string) => {
    if (!onQuickCreate) return;
    setIsSubmitting(true);
    setSelectedTemplate(templateKey || null);
    try {
      await onQuickCreate(templateKey);
      onClose();
    } finally {
      setIsSubmitting(false);
      setSelectedTemplate(null);
    }
  };

  const showQuickCreate = canQuickCreate && bookTypeConfig.canQuickCreate;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={() => !isSubmitting && onClose()}>
          <Pressable
            style={step === 'create' ? styles.content : typePickerStyles.content}
            onPress={e => e.stopPropagation()}
          >
            {step === 'pick-category' ? (
              <>
                <Text style={typePickerStyles.title}>{t('books.chooseCategory', 'Choose a category')}</Text>
                <ScrollView style={typePickerStyles.grid} showsVerticalScrollIndicator={false}>
                  <View style={typePickerStyles.gridInner}>
                    {BOOK_TYPE_CATEGORY_CONFIGS.map(cat => (
                      <CategoryTile
                        key={cat.id}
                        config={cat}
                        typeCount={getBookTypesForCategory(cat.id).length}
                        onPress={() => handleSelectCategory(cat.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="button-cancel-category-picker">
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : step === 'pick-type' ? (
              <>
                <View style={typePickerStyles.createHeader}>
                  <TouchableOpacity
                    onPress={handleBackToCategories}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="button-back-to-categories"
                  >
                    <Ionicons name="arrow-back" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                  <Text style={typePickerStyles.createTitle}>
                    {selectedCategory
                      ? t(BOOK_TYPE_CATEGORY_CONFIGS.find(c => c.id === selectedCategory)?.nameKey || '')
                      : t('books.chooseType', 'Choose a type')}
                  </Text>
                  <View style={{ width: 22 }} />
                </View>
                <ScrollView style={typePickerStyles.grid} showsVerticalScrollIndicator={false}>
                  <View style={typePickerStyles.gridInner}>
                    {filteredBookTypes.map(config => (
                      <BookTypeTile key={config.id} config={config} onPress={() => handleSelectType(config.id)} />
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity style={styles.cancelButton} onPress={onClose} testID="button-cancel-type-picker">
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={typePickerStyles.createHeader}>
                  <TouchableOpacity
                    onPress={handleBackToTypePicker}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID="button-back-to-types"
                  >
                    <Ionicons name="arrow-back" size={22} color={colors.text.secondary} />
                  </TouchableOpacity>
                  <Text style={typePickerStyles.createTitle}>
                    {t(
                      bookTypeConfig.createTitleKey,
                      bookTypeConfig.id === BOOK_TYPE_IDS.PERSONAL ? 'Create Journal' : 'Create Book'
                    )}
                  </Text>
                  <View style={{ width: 22 }} />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
                  onPress={handleOpenGenerator}
                  disabled={isSubmitting}
                  testID="button-ai-create"
                >
                  <View style={styles.primaryButtonContent}>
                    <Ionicons name="sparkles" size={22} color={colors.absolute.white} />
                    <Text style={styles.primaryButtonText}>{t('books.generateWithAI', 'Generate with AI')}</Text>
                  </View>
                  <Text style={styles.primaryButtonHint}>{t(bookTypeConfig.createDescriptionKey)}</Text>
                </TouchableOpacity>

                {showQuickCreate && onQuickCreate && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>{t('common.or', 'OR')}</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                      style={[styles.quickOption, isSubmitting && styles.quickOptionDisabled]}
                      onPress={() => handleQuickCreate()}
                      disabled={isSubmitting}
                      testID="button-quick-create-blank"
                    >
                      <Ionicons name="document-outline" size={20} color={colors.text.primary} />
                      <Text style={styles.quickOptionText}>
                        {bookTypeConfig.blankTitleKey ? t(bookTypeConfig.blankTitleKey) : t('books.blankJournal')}
                      </Text>
                      {isSubmitting && !selectedTemplate && (
                        <Text style={styles.creatingText}>{t('common.creating')}</Text>
                      )}
                    </TouchableOpacity>

                    {templates && templates.length > 0 && (
                      <ScrollView style={styles.templateList} showsVerticalScrollIndicator={false}>
                        {templates.map(tmpl => (
                          <TouchableOpacity
                            key={tmpl.key}
                            style={[styles.quickOption, isSubmitting && styles.quickOptionDisabled]}
                            onPress={() => handleQuickCreate(tmpl.key)}
                            disabled={isSubmitting}
                            testID={`button-quick-create-${tmpl.key}`}
                          >
                            <Ionicons name="folder-outline" size={20} color={colors.brand.primary} />
                            <View style={styles.quickOptionContent}>
                              <Text style={styles.quickOptionText}>{tmpl.label}</Text>
                              <Text style={styles.quickOptionHint} numberOfLines={1}>
                                {tmpl.description}
                              </Text>
                            </View>
                            {isSubmitting && selectedTemplate === tmpl.key && (
                              <Text style={styles.creatingText}>{t('common.creating')}</Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  disabled={isSubmitting}
                  testID="button-cancel-create"
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <BookGeneratorModal
        visible={showGenerator}
        onClose={handleCloseGenerator}
        onCreateBook={handleCreateBook}
        bookTypeId={selectedTypeId}
      />
    </>
  );
}

const createTypePickerStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '80%',
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 16,
      textAlign: 'center',
    },
    grid: {
      flexGrow: 0,
    },
    gridInner: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
    },
    tile: {
      width: '48%',
      backgroundColor: colors.background.subtle,
      borderRadius: BORDER_RADIUS.md,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    tileIconWrap: {
      width: 44,
      height: 44,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    tileName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    tileDesc: {
      fontSize: 11,
      color: colors.text.tertiary,
      lineHeight: 15,
    },
    tileCount: {
      fontSize: 10,
      color: colors.text.tertiary,
      marginTop: 6,
      fontWeight: '500',
    },
    createHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    createTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      flex: 1,
    },
  });

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    content: {
      width: '100%',
      maxWidth: 350,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    primaryButtonHint: {
      fontSize: 12,
      color: colors.absolute.white,
      opacity: 0.8,
      textAlign: 'center',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 8,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.muted,
    },
    dividerText: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '600',
      paddingHorizontal: 12,
    },
    quickOption: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.subtle,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.muted,
      gap: 12,
    },
    quickOptionDisabled: {
      opacity: 0.6,
    },
    quickOptionContent: {
      flex: 1,
    },
    quickOptionText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.primary,
    },
    quickOptionHint: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    creatingText: {
      fontSize: 12,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    templateList: {
      maxHeight: 200,
    },
    cancelButton: {
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    cancelButtonText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '600',
    },
  });
