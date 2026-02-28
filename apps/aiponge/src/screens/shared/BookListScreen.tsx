import { useState, useCallback, useMemo, useEffect, type ComponentProps } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { useTranslation, i18n } from '../../i18n';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';
import { useAuthStore, selectUser } from '../../auth/store';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { BookCard, type BookCardData } from '../../components/book/BookCard';
import { CreateBookModal, CloneBookModal } from '../../components/book';
import { BOOK_TYPES, type BookTypeId } from '../../constants/bookTypes';

import type { BookListScreenProps } from './book-list/types';
import { useBookListData } from './book-list/useBookListData';
import { useBookMutations } from './book-list/useBookMutations';
import { EditBookModal } from './book-list/EditBookModal';

export function BookListScreen({ embedded = false, externalCreateTrigger, onStudioPress }: BookListScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const user = useAuthStore(selectUser);
  const userDisplayName = user?.name || user?.username || '';
  const [refreshing, setRefreshing] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [cloneTarget, setCloneTarget] = useState<BookCardData | null>(null);
  const [actionTarget, setActionTarget] = useState<BookCardData | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  useEffect(() => {
    if (externalCreateTrigger && externalCreateTrigger > 0) {
      setCreateModalVisible(true);
    }
  }, [externalCreateTrigger]);

  const data = useBookListData({ userDisplayName, t });

  // Reset language selector to the current app language every time the screen is focused.
  useFocusEffect(
    useCallback(() => {
      const appLang = (i18n.language || 'en').split('-')[0];
      data.setSelectedLanguage(appLang);
    }, [data.setSelectedLanguage])
  );

  const mutations = useBookMutations({
    refetchManageBooks: data.refetchManageBooks,
    t,
    userId: user?.id,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([data.refetchBrowseBooks(), data.refetchLibrary(), data.refetchManageBooks()]);
    setRefreshing(false);
  }, [data.refetchBrowseBooks, data.refetchLibrary, data.refetchManageBooks]);

  const handleCloneBook = useCallback((book: BookCardData) => {
    setCloneTarget(book);
  }, []);

  const handleManageBook = useCallback((book: BookCardData) => {
    setActionTarget(book);
  }, []);

  const renderGridItem = useCallback(
    ({ item, index }: { item: BookCardData; index: number }) => {
      const isOwned = !!user?.id && item.userId === user.id;
      return (
        <BookCard
          book={item}
          layout="grid"
          isSaved={data.savedBookIds.has(item.id)}
          onPress={mutations.handleBookPress}
          columnIndex={index}
          onManage={isOwned ? handleManageBook : undefined}
          onClone={!isOwned ? handleCloneBook : undefined}
        />
      );
    },
    [data.savedBookIds, mutations.handleBookPress, handleManageBook, handleCloneBook, user?.id]
  );

  const languageOptions = useMemo(
    () => [
      { value: '', label: t('components.sharedLibrary.allLanguages') || 'All Languages' },
      ...SUPPORTED_LANGUAGES.map(lang => ({
        value: lang.code.split('-')[0],
        label: lang.nativeLabel,
      })),
    ],
    [t]
  );

  const selectedLanguageLabel =
    languageOptions.find(o => o.value === data.selectedLanguage)?.label || languageOptions[0].label;

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={mutations.handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('library.title') || 'Books'}</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      <View style={styles.typeTabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeTabContent}>
          <TouchableOpacity
            style={[styles.typeTab, !data.selectedTypeId && styles.typeTabActive]}
            onPress={() => data.setSelectedTypeId(null)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="apps-outline"
              size={16}
              color={!data.selectedTypeId ? colors.absolute.white : colors.text.secondary}
            />
            <Text style={[styles.typeTabText, !data.selectedTypeId && styles.typeTabTextActive]}>
              {t('common.all') || 'All'}
            </Text>
          </TouchableOpacity>
          {data.browsableBookTypes.map(bookType => {
            const isActive = data.selectedTypeId === bookType.id;
            const uiConfig = BOOK_TYPES[bookType.id as BookTypeId];
            const iconName = uiConfig
              ? isActive
                ? uiConfig.iconFilled
                : uiConfig.icon
              : bookType.iconName || 'book-outline';
            const label = uiConfig ? t(uiConfig.nameKey) || bookType.name : bookType.name;
            return (
              <TouchableOpacity
                key={bookType.id}
                style={[styles.typeTab, isActive && styles.typeTabActive]}
                onPress={() => data.setSelectedTypeId(isActive ? null : bookType.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={iconName as ComponentProps<typeof Ionicons>['name']}
                  size={16}
                  color={isActive ? colors.absolute.white : colors.text.secondary}
                />
                <Text style={[styles.typeTabText, isActive && styles.typeTabTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <Pressable style={styles.dropdown} onPress={() => setShowLanguagePicker(true)}>
          <Ionicons name="language-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.dropdownText} numberOfLines={1}>
            {selectedLanguageLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
        </Pressable>
        {onStudioPress && (
          <Pressable style={styles.studioButton} onPress={onStudioPress}>
            <Ionicons name="color-palette-outline" size={16} color={colors.brand.primary} />
            <Text style={[styles.dropdownText, { color: colors.brand.primary }]}>
              {t('navigation.studio') || 'Studio'}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowLanguagePicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{t('components.sharedLibrary.selectLanguage') || 'Select Language'}</Text>
            {languageOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.pickerOption, data.selectedLanguage === opt.value && styles.pickerOptionActive]}
                onPress={() => {
                  data.setSelectedLanguage(opt.value);
                  setShowLanguagePicker(false);
                }}
                testID={`book-language-${opt.value || 'all'}`}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    data.selectedLanguage === opt.value && styles.pickerOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {data.selectedLanguage === opt.value && (
                  <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {data.isLoading ? (
        <LoadingState message={t('library.loadingBooks') || 'Loading books...'} />
      ) : data.unifiedBooks.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title={t('library.noBooks') || 'No books found'}
          description={t('library.checkBackSoon') || 'Check back soon for new content'}
        />
      ) : (
        <FlatList
          data={data.unifiedBooks}
          renderItem={renderGridItem}
          keyExtractor={(item, index) => item.id || `fallback-${index}`}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (data.hasNextBrowsePage && !data.isFetchingNextBrowsePage) {
              data.fetchNextBrowsePage();
            }
          }}
          onEndReachedThreshold={0.5}
          initialNumToRender={9}
          maxToRenderPerBatch={9}
          windowSize={5}
          removeClippedSubviews={true}
          ListFooterComponent={
            data.isFetchingNextBrowsePage ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.brand.primary} />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />
          }
        />
      )}

      {actionTarget && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setActionTarget(null)}>
          <Pressable style={styles.actionSheetOverlay} onPress={() => setActionTarget(null)}>
            <View style={styles.actionSheet}>
              <View style={styles.actionSheetHandle} />
              <Text style={styles.actionSheetTitle} numberOfLines={1}>
                {actionTarget.title}
              </Text>

              <TouchableOpacity
                style={styles.actionSheetOption}
                onPress={() => {
                  mutations.handleEdit(actionTarget);
                  setActionTarget(null);
                }}
              >
                <Ionicons name="pencil-outline" size={20} color={colors.text.primary} />
                <Text style={styles.actionSheetOptionText}>{t('librarian.books.edit') || 'Edit Details'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionSheetOption}
                onPress={() => {
                  mutations.handleUploadCover(actionTarget);
                  setActionTarget(null);
                }}
              >
                <Ionicons name="image-outline" size={20} color={colors.brand.secondary} />
                <Text style={styles.actionSheetOptionText}>{t('bookDetail.generateCover') || 'Upload Cover'}</Text>
              </TouchableOpacity>

              {actionTarget.status === 'draft' && (
                <TouchableOpacity
                  style={styles.actionSheetOption}
                  onPress={() => {
                    mutations.publishBookMutation.mutate(actionTarget.id);
                    setActionTarget(null);
                  }}
                >
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.actionSheetOptionText}>{t('librarian.books.publish') || 'Publish'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionSheetOption}
                onPress={() => {
                  mutations.handleDelete(actionTarget);
                  setActionTarget(null);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
                <Text style={[styles.actionSheetOptionText, { color: colors.semantic.error }]}>
                  {t('common.delete') || 'Delete'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionSheetOption, styles.actionSheetCancel]}
                onPress={() => setActionTarget(null)}
              >
                <Text style={styles.actionSheetCancelText}>{t('common.cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {cloneTarget && <CloneBookModal visible={true} onClose={() => setCloneTarget(null)} sourceBook={cloneTarget} />}

      <CreateBookModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreateFromBlueprint={mutations.handleCreateFromBlueprint}
      />

      <EditBookModal
        visible={mutations.editModalVisible}
        onClose={() => mutations.setEditModalVisible(false)}
        formData={mutations.formData}
        onChangeFormData={mutations.setFormData}
        onSubmit={mutations.handleSubmit}
        isPending={mutations.updateBookMutation.isPending}
      />
    </View>
  );
}

export { BookListScreen as default };

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    containerEmbedded: {
      paddingTop: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    headerSpacer: {
      width: 40,
    },
    typeTabContainer: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      marginBottom: 4,
    },
    typeTabContent: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    typeTab: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background.secondary,
      gap: 6,
    },
    typeTabActive: {
      backgroundColor: colors.brand.primary,
    },
    typeTabText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    typeTabTextActive: {
      color: colors.absolute.white,
      fontWeight: '600',
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    dropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      flex: 1,
    },
    dropdownText: {
      fontSize: 13,
      color: colors.text.secondary,
      flex: 1,
    },
    studioButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.brand.primary + '50',
    },
    gridContent: {
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 120,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingBottom: 40,
      paddingTop: 16,
      maxHeight: '70%',
    },
    pickerTitle: {
      fontSize: 16,
      fontWeight: '600',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 16,
    },
    pickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: BORDER_RADIUS.sm,
    },
    pickerOptionActive: {
      backgroundColor: colors.brand.primary + '15',
    },
    pickerOptionText: {
      fontSize: 15,
      color: colors.text.primary,
    },
    pickerOptionTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    actionSheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    actionSheet: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    actionSheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.primary,
      alignSelf: 'center',
      marginBottom: 16,
    },
    actionSheetTitle: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    actionSheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    actionSheetOptionText: {
      fontSize: 16,
      color: colors.text.primary,
    },
    actionSheetCancel: {
      justifyContent: 'center',
      borderBottomWidth: 0,
      marginTop: 4,
    },
    actionSheetCancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.secondary,
      textAlign: 'center',
      flex: 1,
    },
  });
