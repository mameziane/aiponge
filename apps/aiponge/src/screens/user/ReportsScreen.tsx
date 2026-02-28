import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { useAuthStore, selectUser } from '../../auth/store';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';

type ReportType = 'insights' | 'personalBook' | 'lyrics';
type ReportStatus = 'idle' | 'generating' | 'ready' | 'error';

interface ReportConfig {
  type: ReportType;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  descriptionKey: string;
  noDataKey: string;
}

const REPORT_CONFIGS: ReportConfig[] = [
  {
    type: 'insights',
    icon: 'analytics-outline',
    titleKey: 'screens.reports.insightsReport',
    descriptionKey: 'screens.reports.insightsDescription',
    noDataKey: 'screens.reports.noEntries',
  },
  {
    type: 'personalBook',
    icon: 'book-outline',
    titleKey: 'screens.reports.bookReport',
    descriptionKey: 'screens.reports.bookDescription',
    noDataKey: 'screens.reports.noEntries',
  },
  {
    type: 'lyrics',
    icon: 'musical-notes-outline',
    titleKey: 'screens.reports.lyricsReport',
    descriptionKey: 'screens.reports.lyricsDescription',
    noDataKey: 'screens.reports.noLyrics',
  },
];

interface DataAvailability {
  hasEntries: boolean;
  hasLyrics: boolean;
  loading: boolean;
}

interface PersonalBook {
  id: string;
  title: string;
  description?: string;
  isDefault?: boolean;
}

interface Chapter {
  id: string;
  title: string;
  entryCount?: number;
}

interface Track {
  id: string;
  title: string;
  displayName?: string;
}

type SelectionModal = 'none' | 'personalBook' | 'chapter' | 'track';

export default function ReportsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useAuthStore(selectUser);
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [status, setStatus] = useState<ReportStatus>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [dataAvailability, setDataAvailability] = useState<DataAvailability>({
    hasEntries: false,
    hasLyrics: false,
    loading: true,
  });

  const [selectionModal, setSelectionModal] = useState<SelectionModal>('none');
  const [personalBooks, setPersonalBooks] = useState<PersonalBook[]>([]);
  const [selectedPersonalBook, setSelectedPersonalBook] = useState<PersonalBook | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingSelection, setLoadingSelection] = useState(false);

  useEffect(() => {
    checkDataAvailability();
  }, [user?.id]);

  const checkDataAvailability = async () => {
    if (!user?.id || user?.isGuest) {
      setDataAvailability({ hasEntries: false, hasLyrics: false, loading: false });
      return;
    }

    try {
      const [entriesResponse, tracksResponse] = await Promise.all([
        apiClient.get<{
          success?: boolean;
          data?: { entries?: unknown[]; total?: number };
          entries?: unknown[];
          total?: number;
        }>('/api/v1/app/entries?limit=1'),
        apiClient.get<{
          success?: boolean;
          data?: { tracks?: unknown[]; total?: number };
          tracks?: unknown[];
          total?: number;
        }>('/api/v1/app/library/private?limit=1'),
      ]);

      // Handle both response formats: { data: { entries/tracks, total } } and { entries/tracks, total }
      const entryData = entriesResponse.data || entriesResponse;
      const trackData = tracksResponse.data || tracksResponse;

      const entryCount = entryData?.total ?? entryData?.entries?.length ?? 0;
      const trackCount = trackData?.total ?? trackData?.tracks?.length ?? 0;

      setDataAvailability({
        hasEntries: entryCount > 0,
        hasLyrics: trackCount > 0,
        loading: false,
      });

      logger.info('[ReportsScreen] Data availability checked', { entryCount, trackCount });
    } catch (error) {
      logger.error('[ReportsScreen] Failed to check data availability', error);
      setDataAvailability({ hasEntries: false, hasLyrics: false, loading: false });
    }
  };

  const isReportAvailable = (type: ReportType): boolean => {
    if (dataAvailability.loading) return false;
    switch (type) {
      case 'insights':
      case 'personalBook':
        return dataAvailability.hasEntries;
      case 'lyrics':
        return dataAvailability.hasLyrics;
      default:
        return false;
    }
  };

  const loadPersonalBooks = async () => {
    setLoadingSelection(true);
    try {
      const response = await apiClient.get<{
        success?: boolean;
        data?: { items?: PersonalBook[]; books?: PersonalBook[] } | PersonalBook[];
      }>('/api/v1/app/library/books?typeId=personal');
      const responseData = response.data;
      const bookList = Array.isArray(responseData)
        ? responseData
        : (responseData && 'items' in responseData
            ? responseData.items
            : responseData && 'books' in responseData
              ? responseData.books
              : []) || [];
      setPersonalBooks(bookList);
      logger.info('[ReportsScreen] Loaded personal books', { count: bookList.length });
    } catch (error) {
      logger.error('[ReportsScreen] Failed to load personal books', error);
      setPersonalBooks([]);
    } finally {
      setLoadingSelection(false);
    }
  };

  const loadChapters = async (bookId?: string) => {
    setLoadingSelection(true);
    try {
      const endpoint = bookId ? `/api/v1/app/library/books/${bookId}/chapters` : '/api/v1/app/library/chapters';
      const response = await apiClient.get<{ success?: boolean; data?: { chapters?: Chapter[] } | Chapter[] }>(
        endpoint
      );
      const responseData = response.data;
      const chapterList = Array.isArray(responseData)
        ? responseData
        : (responseData && 'chapters' in responseData ? responseData.chapters : []) || [];
      setChapters(chapterList);
      logger.info('[ReportsScreen] Loaded chapters', { count: chapterList.length, bookId });
    } catch (error) {
      logger.error('[ReportsScreen] Failed to load chapters', error);
      setChapters([]);
    } finally {
      setLoadingSelection(false);
    }
  };

  const loadTracks = async () => {
    setLoadingSelection(true);
    try {
      const response = await apiClient.get<{ success?: boolean; data?: { tracks?: Track[] }; tracks?: Track[] }>(
        '/api/v1/app/library/private?limit=100'
      );
      const trackList = response.data?.tracks || response.tracks || [];
      setTracks(trackList);
      logger.info('[ReportsScreen] Loaded tracks', { count: trackList.length });
    } catch (error) {
      logger.error('[ReportsScreen] Failed to load tracks', error);
      setTracks([]);
    } finally {
      setLoadingSelection(false);
    }
  };

  const handleReportPress = async (reportType: ReportType) => {
    if (!isReportAvailable(reportType)) {
      logger.warn('[ReportsScreen] Attempted to generate report with no data', { reportType });
      return;
    }

    if (reportType === 'personalBook') {
      await loadPersonalBooks();
      setSelectionModal('personalBook');
    } else if (reportType === 'lyrics') {
      await loadTracks();
      setSelectionModal('track');
    } else {
      handleGenerateReport(reportType);
    }
  };

  const handlePersonalBookSelect = async (book: PersonalBook | null) => {
    if (book) {
      setSelectedPersonalBook(book);
      await loadChapters(book.id);
      setSelectionModal('chapter');
    } else {
      setSelectionModal('none');
      handleGenerateReport('personalBook');
    }
  };

  const handleChapterSelect = (chapter: Chapter | null) => {
    setSelectionModal('none');
    if (chapter) {
      handleGenerateReport('personalBook', { chapterId: chapter.id, bookId: selectedPersonalBook?.id });
    } else if (selectedPersonalBook) {
      handleGenerateReport('personalBook', { bookId: selectedPersonalBook.id });
    } else {
      handleGenerateReport('personalBook');
    }
    setSelectedPersonalBook(null);
  };

  const handleTrackSelect = (track: Track) => {
    setSelectionModal('none');
    handleGenerateReport('lyrics', { trackId: track.id });
  };

  const handleGenerateReport = async (
    reportType: ReportType,
    options?: { chapterId?: string; trackId?: string; bookId?: string }
  ) => {
    setSelectedReport(reportType);
    setStatus('generating');
    setErrorMessage('');
    setDownloadUrl(null);

    try {
      let endpoint = '';
      let body: Record<string, unknown> = {};

      switch (reportType) {
        case 'insights':
          endpoint = '/api/v1/app/reports/insights';
          body = {
            timeRangeDays: 90,
            includeSections: {
              overview: true,
              themes: true,
              emotionalTrends: true,
              growthHighlights: true,
              suggestions: true,
            },
          };
          break;
        case 'personalBook':
          endpoint = '/api/v1/app/reports/journal';
          body = { format: 'chapters', chapterId: options?.chapterId, bookId: options?.bookId };
          break;
        case 'lyrics':
          endpoint = '/api/v1/app/reports/lyrics';
          body = { trackId: options?.trackId };
          break;
      }

      type ReportResponse = ServiceResponse<{
        downloadUrl: string;
        entryCount?: number;
        trackCount?: number;
        chapterCount?: number;
      }>;

      const response = await apiClient.post<ReportResponse>(endpoint, body);

      if (response.success && response.data?.downloadUrl) {
        const url = response.data.downloadUrl;
        setDownloadUrl(url);
        setStatus('ready');
        logger.info('[ReportsScreen] Report generated successfully', { reportType });

        // Automatically trigger share dialog
        triggerShare(url);
      } else {
        throw new Error(response.error?.message || t('screens.reports.generationFailed'));
      }
    } catch (error) {
      logger.error('[ReportsScreen] Failed to generate report', { reportType, error });
      setErrorMessage(error instanceof Error ? error.message : t('screens.reports.generationFailed'));
      setStatus('error');
    }
  };

  const triggerShare = async (url: string) => {
    try {
      if (Platform.OS === 'web') {
        if (window.navigator.share) {
          await window.navigator.share({
            title: t('screens.reports.shareTitle'),
            url: url,
          });
        } else {
          await window.navigator.clipboard.writeText(url);
          Alert.alert(t('common.success'), t('screens.reports.linkCopied'));
        }
      } else {
        const { File, Paths } = await import('expo-file-system');
        const Sharing = await import('expo-sharing');
        const token = useAuthStore.getState().token;

        const fileName = `report-${Date.now()}.pdf`;
        const file = new File(Paths.document, fileName);

        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error('Download failed');
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        file.write(bytes);

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: t('screens.reports.shareTitle'),
          });
        } else {
          await Linking.openURL(url);
        }
      }
    } catch (error) {
      logger.error('[ReportsScreen] Failed to share', error);
      Alert.alert(t('common.error'), t('screens.reports.shareFailed'));
    }
  };

  const handleShareAgain = () => {
    if (downloadUrl) {
      triggerShare(downloadUrl);
    }
  };

  const handleReset = () => {
    setSelectedReport(null);
    setStatus('idle');
    setDownloadUrl(null);
    setErrorMessage('');
  };

  const renderReportCard = (config: ReportConfig) => {
    const isSelected = selectedReport === config.type;
    const isGenerating = isSelected && status === 'generating';
    const available = isReportAvailable(config.type);
    const isDisabled = !available || status === 'generating' || dataAvailability.loading;

    return (
      <TouchableOpacity
        key={config.type}
        style={[styles.reportCard, isSelected && styles.reportCardSelected, !available && styles.reportCardDisabled]}
        onPress={() => available && handleReportPress(config.type)}
        disabled={isDisabled}
        testID={`report-card-${config.type}`}
      >
        <View style={styles.reportCardContent}>
          <View
            style={[
              styles.iconContainer,
              isSelected && styles.iconContainerSelected,
              !available && styles.iconContainerDisabled,
            ]}
          >
            {dataAvailability.loading ? (
              <ActivityIndicator size="small" color={colors.text.secondary} />
            ) : isGenerating ? (
              <ActivityIndicator size="small" color={colors.brand.primary} />
            ) : (
              <Ionicons
                name={config.icon}
                size={28}
                color={!available ? colors.text.secondary : isSelected ? colors.brand.primary : colors.text.secondary}
              />
            )}
          </View>
          <View style={styles.reportTextContent}>
            <View style={styles.reportTitleRow}>
              <Text
                style={[
                  styles.reportTitle,
                  isSelected && styles.reportTitleSelected,
                  !available && styles.reportTitleDisabled,
                ]}
              >
                {t(config.titleKey)}
              </Text>
              {!dataAvailability.loading && !available && (
                <View style={styles.noDataBadge}>
                  <Text style={styles.noDataText}>{t(config.noDataKey)}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.reportDescription, !available && styles.reportDescriptionDisabled]}>
              {t(config.descriptionKey)}
            </Text>
          </View>
          {available && <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="share-outline" size={40} color={colors.brand.primary} />
        <Text style={styles.title}>{t('screens.reports.title')}</Text>
        <Text style={styles.subtitle}>{t('screens.reports.subtitle')}</Text>
      </View>

      <View style={styles.reportsSection}>
        <Text style={styles.sectionTitle}>{t('screens.reports.availableReports')}</Text>
        {REPORT_CONFIGS.map(renderReportCard)}
      </View>

      {status === 'error' && (
        <ErrorState message={errorMessage} onRetry={handleReset} retryLabel={t('common.tryAgain')} fullScreen={false} />
      )}

      {status === 'ready' && downloadUrl && (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.semantic.success} />
          <Text style={styles.successText}>{t('screens.reports.reportReady')}</Text>
          <Text style={styles.successSubtext}>{t('screens.reports.shareDialogShown')}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.shareButton} onPress={handleShareAgain} testID="button-share-report">
              <Ionicons name="share-outline" size={20} color={colors.brand.primary} />
              <Text style={styles.shareButtonText}>{t('screens.reports.shareAgain')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleReset} style={styles.generateAnotherButton}>
            <Text style={styles.generateAnotherText}>{t('screens.reports.generateAnother')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.infoSection}>
        <Ionicons name="information-circle-outline" size={20} color={colors.text.secondary} />
        <Text style={styles.infoText}>{t('screens.reports.privacyNote')}</Text>
      </View>

      <Modal
        visible={selectionModal !== 'none'}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectionModal('none')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectionModal === 'personalBook'
                  ? t('screens.reports.selectBook')
                  : selectionModal === 'chapter'
                    ? t('screens.reports.selectChapter')
                    : t('screens.reports.selectTrack')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectionModal('none');
                  setSelectedPersonalBook(null);
                }}
                style={styles.modalCloseButton}
                testID="button-close-selection-modal"
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {loadingSelection ? (
              <LoadingState fullScreen={false} message={t('common.loading')} />
            ) : selectionModal === 'personalBook' ? (
              <ScrollView contentContainerStyle={styles.selectionList}>
                <TouchableOpacity
                  style={styles.selectionItemHighlight}
                  onPress={() => handlePersonalBookSelect(null)}
                  testID="selection-item-all-books"
                >
                  <Ionicons name="albums-outline" size={20} color={colors.absolute.white} />
                  <View style={styles.selectionItemText}>
                    <Text style={styles.selectionItemTitleHighlight}>{t('screens.reports.exportAllBooks')}</Text>
                    <Text style={styles.selectionItemSubtitleHighlight}>
                      {t('screens.reports.exportAllBooksDescription')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.absolute.white} />
                </TouchableOpacity>

                {personalBooks.length > 0 && (
                  <Text style={styles.selectionDivider}>{t('screens.reports.orSelectBook')}</Text>
                )}

                {personalBooks.map(book => (
                  <TouchableOpacity
                    key={book.id}
                    style={styles.selectionItem}
                    onPress={() => handlePersonalBookSelect(book)}
                    testID={`selection-item-book-${book.id}`}
                  >
                    <Ionicons name="book-outline" size={20} color={colors.brand.primary} />
                    <View style={styles.selectionItemText}>
                      <Text style={styles.selectionItemTitle}>{book.title}</Text>
                      {book.description && (
                        <Text style={styles.selectionItemSubtitle} numberOfLines={1}>
                          {book.description}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : selectionModal === 'chapter' ? (
              <ScrollView contentContainerStyle={styles.selectionList}>
                {selectedPersonalBook && (
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => {
                      setSelectionModal('personalBook');
                      setSelectedPersonalBook(null);
                    }}
                    testID="button-back-to-books"
                  >
                    <Ionicons name="arrow-back" size={18} color={colors.brand.primary} />
                    <Text style={styles.backButtonText}>{t('screens.reports.backToBooks')}</Text>
                  </TouchableOpacity>
                )}

                {selectedPersonalBook && (
                  <Text style={styles.selectedBookLabel}>
                    {t('screens.reports.exportingFrom', { book: selectedPersonalBook.title })}
                  </Text>
                )}

                <TouchableOpacity
                  style={styles.selectionItemHighlight}
                  onPress={() => handleChapterSelect(null)}
                  testID="selection-item-all"
                >
                  <Ionicons name="albums-outline" size={20} color={colors.absolute.white} />
                  <View style={styles.selectionItemText}>
                    <Text style={styles.selectionItemTitleHighlight}>{t('screens.reports.exportAllEntries')}</Text>
                    <Text style={styles.selectionItemSubtitleHighlight}>
                      {t('screens.reports.exportAllDescription')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.absolute.white} />
                </TouchableOpacity>

                {chapters.length > 0 && (
                  <Text style={styles.selectionDivider}>{t('screens.reports.orSelectChapter')}</Text>
                )}

                {chapters.map(chapter => (
                  <TouchableOpacity
                    key={chapter.id}
                    style={styles.selectionItem}
                    onPress={() => handleChapterSelect(chapter)}
                    testID={`selection-item-${chapter.id}`}
                  >
                    <Ionicons name="book-outline" size={20} color={colors.brand.primary} />
                    <View style={styles.selectionItemText}>
                      <Text style={styles.selectionItemTitle}>{chapter.title}</Text>
                      {chapter.entryCount !== undefined && (
                        <Text style={styles.selectionItemSubtitle}>
                          {chapter.entryCount} {t('screens.reports.entries')}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <FlatList
                data={tracks}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.selectionItem}
                    onPress={() => handleTrackSelect(item)}
                    testID={`selection-item-${item.id}`}
                  >
                    <Ionicons name="musical-note-outline" size={20} color={colors.brand.primary} />
                    <View style={styles.selectionItemText}>
                      <Text style={styles.selectionItemTitle}>{item.title}</Text>
                      {item.displayName && <Text style={styles.selectionItemSubtitle}>{item.displayName}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyList}>
                    <Text style={styles.emptyListText}>{t('screens.reports.noTracksFound')}</Text>
                  </View>
                }
                contentContainerStyle={styles.selectionList}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
      paddingTop: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
      marginTop: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 8,
      textAlign: 'center',
      lineHeight: 20,
    },
    reportsSection: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 16,
    },
    reportCard: {
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    reportCardSelected: {
      borderColor: colors.brand.primary,
      backgroundColor: `${colors.brand.primary}10`,
    },
    reportCardDisabled: {
      opacity: 0.6,
    },
    reportCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.background.tertiary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    iconContainerSelected: {
      backgroundColor: `${colors.brand.primary}20`,
    },
    iconContainerDisabled: {
      backgroundColor: colors.background.tertiary,
    },
    reportTextContent: {
      flex: 1,
    },
    reportTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    reportTitleSelected: {
      color: colors.brand.primary,
    },
    reportTitleDisabled: {
      color: colors.text.secondary,
    },
    reportTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    comingSoonBadge: {
      backgroundColor: colors.background.tertiary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    comingSoonText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
    },
    noDataBadge: {
      backgroundColor: `${colors.semantic.warning}20`,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    noDataText: {
      fontSize: 10,
      fontWeight: '500',
      color: colors.semantic.warning,
    },
    reportDescription: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    reportDescriptionDisabled: {
      color: colors.text.secondary,
      opacity: 0.7,
    },
    successContainer: {
      alignItems: 'center',
      padding: 24,
      backgroundColor: `${colors.semantic.success}10`,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
    },
    successText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.semantic.success,
      marginTop: 8,
      marginBottom: 4,
    },
    successSubtext: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 20,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    downloadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: BORDER_RADIUS.sm,
    },
    downloadButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    shareButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background.secondary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    shareButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    generateAnotherButton: {
      marginTop: 16,
    },
    generateAnotherText: {
      fontSize: 14,
      color: colors.text.secondary,
      textDecorationLine: 'underline',
    },
    infoSection: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 16,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[50],
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
      paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalCloseButton: {
      padding: 4,
    },
    selectionList: {
      padding: 16,
    },
    selectionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
      gap: 12,
    },
    selectionItemText: {
      flex: 1,
    },
    selectionItemTitle: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.primary,
    },
    selectionItemSubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    emptyList: {
      alignItems: 'center',
      padding: 40,
    },
    emptyListText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    selectionItemHighlight: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 16,
      gap: 12,
    },
    selectionItemTitleHighlight: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    selectionItemSubtitleHighlight: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    selectionDivider: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
      marginVertical: 12,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 16,
      paddingVertical: 8,
    },
    backButtonText: {
      fontSize: 14,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    selectedBookLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 12,
      fontStyle: 'italic',
    },
  });

const styles = StyleSheet.create({});
