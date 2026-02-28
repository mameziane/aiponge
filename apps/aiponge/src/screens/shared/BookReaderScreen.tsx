/* global requestAnimationFrame */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, Z_INDEX } from '../../theme';
import { useAuthStore, selectToken } from '../../auth/store';
import { useReadingProgress, useReaderPagination, useBookDisplay, type FontSize } from '../../hooks/book';
import {
  TitlePage,
  TableOfContents,
  ChapterContent,
  ReaderNavigation,
  FontSizeControl,
  SelectionMenu,
} from '../../components/book';
import { EmptyState } from '../../components/shared/EmptyState';
import { LoadingState } from '../../components/shared/LoadingState';
import { apiRequest } from '../../lib/axiosApiClient';
import { useTrackGenerationStore, selectTrackStartGeneration, selectTrackSetPendingGeneration } from '../../stores';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD_X = SCREEN_WIDTH * 0.25;
const SWIPE_THRESHOLD_Y = SCREEN_HEIGHT * 0.15;

export function BookReaderScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const token = useAuthStore(selectToken);

  const [fontSize, setFontSize] = useState<FontSize>('m');
  const [showFontModal, setShowFontModal] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; text: string } | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [isSelectingText, setIsSelectingText] = useState(false);
  const [clearSelectionTrigger, setClearSelectionTrigger] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const startGeneration = useTrackGenerationStore(selectTrackStartGeneration);
  const setPendingGeneration = useTrackGenerationStore(selectTrackSetPendingGeneration);

  const { book, isLoading } = useBookDisplay(bookId || '');

  const { progress, updateProgress } = useReadingProgress(bookId || '');

  const {
    pages,
    currentPage,
    currentPageIndex,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    goToChapter,
    goToToc,
    setCurrentPageIndex,
    findPageByProgress,
    fontSize: fontSizeValue,
    lineHeight,
  } = useReaderPagination(book || undefined, fontSize);

  useEffect(() => {
    if (progress && !initialLoaded && pages.length > 0) {
      const targetPage = findPageByProgress(progress.lastChapterId, progress.lastEntryId, progress.currentPageIndex);
      const clampedPage = Math.min(Math.max(0, targetPage), pages.length - 1);
      setCurrentPageIndex(clampedPage);
      if (progress.fontSize) {
        setFontSize(progress.fontSize);
      }
      setInitialLoaded(true);
    }
  }, [progress, initialLoaded, pages.length, findPageByProgress, setCurrentPageIndex]);

  useEffect(() => {
    if (!currentPage || !initialLoaded || !token) return;

    const isContentPage = currentPage.type === 'content' || currentPage.type === 'chapter-start';
    if (isContentPage && currentPage.chapterId) {
      const firstEntryId = currentPage.entryIds?.[0] || null;
      updateProgress({
        lastChapterId: currentPage.chapterId,
        lastEntryId: firstEntryId,
        currentPageIndex,
      });
    }
  }, [currentPageIndex, currentPage, initialLoaded, updateProgress, token]);

  useEffect(() => {
    if (initialLoaded && pages.length > 0 && currentPageIndex >= pages.length) {
      setCurrentPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pages.length, currentPageIndex, initialLoaded, setCurrentPageIndex]);

  const handleFontSizeChange = useCallback(
    (newSize: FontSize) => {
      setFontSize(newSize);
      if (token) {
        updateProgress({ fontSize: newSize });
      }
    },
    [updateProgress, token]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const toggleControls = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  const handleTextSelected = useCallback(
    (entryId: string, selectedText: string, position: { x: number; y: number }) => {
      setSelectedEntry({ id: entryId, text: selectedText });
      setMenuPosition(position);
      setShowSelectionMenu(true);
      setIsSelectingText(false);
    },
    []
  );

  const handleSelectionStart = useCallback(() => {
    setIsSelectingText(true);
  }, []);

  const handleSelectionCleared = useCallback(() => {
    setSelectedEntry(null);
    setShowSelectionMenu(false);
    setIsSelectingText(false);
  }, []);

  const handleCopyText = useCallback(async () => {
    if (selectedEntry) {
      await Clipboard.setStringAsync(selectedEntry.text);
      Alert.alert('Copied', 'Text copied to clipboard');
    }
    setShowSelectionMenu(false);
    setSelectedEntry(null);
    setClearSelectionTrigger(prev => prev + 1);
  }, [selectedEntry]);

  const handleCreateEntry = useCallback(async () => {
    if (!selectedEntry || !token) {
      Alert.alert('Sign in required', 'Please sign in to save entries');
      setShowSelectionMenu(false);
      return;
    }

    try {
      const chapterTitle =
        currentPage?.chapterId && book?.chapters
          ? book.chapters.find(c => c.id === currentPage.chapterId)?.title
          : undefined;

      const response = (await apiRequest('/api/v1/app/entries', {
        method: 'POST',
        data: {
          content: selectedEntry.text,
          entryType: 'bookmark',
          autoAssignBookmarks: true,
          metadata: {
            sourceType: 'book',
            bookId,
            bookTitle: book?.title,
            bookAuthor: book?.author,
            chapterId: currentPage?.chapterId,
            chapterTitle,
          },
        },
      })) as { success?: boolean };

      if (response.success) {
        Alert.alert('Saved', 'Added to your Bookmarks');
      } else {
        Alert.alert('Error', 'Failed to save bookmark');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save bookmark');
    }

    setShowSelectionMenu(false);
    setSelectedEntry(null);
    setClearSelectionTrigger(prev => prev + 1);
  }, [selectedEntry, token, currentPage?.chapterId, book, bookId]);

  const handleCreateSong = useCallback(async () => {
    if (!selectedEntry || !token) {
      Alert.alert('Sign in required', 'Please sign in to create songs');
      setShowSelectionMenu(false);
      return;
    }

    try {
      setPendingGeneration(true);

      const response = await apiRequest<{ requestId: string }>('/api/v1/app/music/generate', {
        method: 'POST',
        data: {
          entryContent: selectedEntry.text,
        },
      });

      if (response.requestId) {
        startGeneration(response.requestId, { entryContent: selectedEntry.text });
        Alert.alert('Creating Song', 'Your song is being generated. Check your library soon!');
      }
    } catch (error) {
      setPendingGeneration(false);
      Alert.alert('Error', 'Failed to start song generation');
    }

    setShowSelectionMenu(false);
    setSelectedEntry(null);
    setClearSelectionTrigger(prev => prev + 1);
  }, [selectedEntry, token, bookId, startGeneration, setPendingGeneration]);

  const closeSelectionMenu = useCallback(() => {
    setShowSelectionMenu(false);
    setSelectedEntry(null);
    setClearSelectionTrigger(prev => prev + 1);
  }, []);

  const nextPageRef = useRef(nextPage);
  const prevPageRef = useRef(prevPage);
  const toggleControlsRef = useRef(toggleControls);
  const isSelectingTextRef = useRef(isSelectingText);

  useEffect(() => {
    nextPageRef.current = nextPage;
    prevPageRef.current = prevPage;
    toggleControlsRef.current = toggleControls;
  }, [nextPage, prevPage, toggleControls]);

  useEffect(() => {
    isSelectingTextRef.current = isSelectingText;
  }, [isSelectingText]);

  const pageOpacityRef = useRef(pageOpacity);
  const isSwiping = useRef(false);
  const startTime = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isSelectingTextRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isSelectingTextRef.current) return false;
        const isHorizontalSwipe =
          Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        const isVerticalSwipe = Math.abs(gestureState.dy) > 15 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        if (isHorizontalSwipe || isVerticalSwipe) {
          isSwiping.current = true;
        }
        return isHorizontalSwipe || isVerticalSwipe;
      },
      onPanResponderGrant: () => {
        isSwiping.current = false;
        startTime.current = Date.now();
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
          isSwiping.current = true;
          if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
            translateX.setValue(gestureState.dx);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const duration = Date.now() - startTime.current;
        const wasTap =
          !isSwiping.current && duration < 300 && Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;

        if (wasTap) {
          toggleControlsRef.current();
          return;
        }

        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

        if (isHorizontal) {
          if (gestureState.dx > SWIPE_THRESHOLD_X) {
            Animated.timing(translateX, {
              toValue: SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              pageOpacityRef.current.setValue(0);
              prevPageRef.current();
              translateX.setValue(0);
              requestAnimationFrame(() => {
                pageOpacityRef.current.setValue(1);
              });
            });
          } else if (gestureState.dx < -SWIPE_THRESHOLD_X) {
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              pageOpacityRef.current.setValue(0);
              nextPageRef.current();
              translateX.setValue(0);
              requestAnimationFrame(() => {
                pageOpacityRef.current.setValue(1);
              });
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        } else {
          if (gestureState.dy < -SWIPE_THRESHOLD_Y) {
            pageOpacityRef.current.setValue(0);
            nextPageRef.current();
            requestAnimationFrame(() => {
              pageOpacityRef.current.setValue(1);
            });
          } else if (gestureState.dy > SWIPE_THRESHOLD_Y) {
            pageOpacityRef.current.setValue(0);
            prevPageRef.current();
            requestAnimationFrame(() => {
              pageOpacityRef.current.setValue(1);
            });
          }
          translateX.setValue(0);
        }
      },
    })
  ).current;

  if (isLoading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <LoadingState />
      </>
    );
  }

  if (!book) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="book-outline"
          title={t('reader.bookNotFound')}
          description={t('reader.bookNotFoundDescription')}
        />
      </View>
    );
  }

  const renderPage = () => {
    if (!currentPage) return null;

    switch (currentPage.type) {
      case 'title':
        return (
          <TitlePage
            title={book.title}
            subtitle={book.subtitle}
            author={book.author}
            coverIllustrationUrl={book.coverIllustrationUrl}
            category={book.category}
          />
        );
      case 'toc':
        return <TableOfContents bookTitle={book.title} chapters={book.chapters} onSelectChapter={goToChapter} />;
      case 'chapter-start':
      case 'content':
        return (
          <ChapterContent
            page={currentPage}
            fontSize={fontSizeValue}
            lineHeight={lineHeight}
            onTextSelected={handleTextSelected}
            onSelectionStart={handleSelectionStart}
            onSelectionCleared={handleSelectionCleared}
            clearSelectionTrigger={clearSelectionTrigger}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" hidden={!showControls} />

      {showControls && (
        <View style={styles.header}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.headerAndroidFallback]} />
          )}
          <View style={styles.headerGradientOverlay} />
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={() => setShowFontModal(true)}>
              <Ionicons name="text" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.contentContainer} {...panResponder.panHandlers}>
        <Animated.View style={[styles.pageContainer, { transform: [{ translateX }], opacity: pageOpacity }]}>
          {renderPage()}
        </Animated.View>
      </View>

      {showControls && (
        <ReaderNavigation
          currentPage={currentPageIndex}
          totalPages={totalPages}
          onPrev={prevPage}
          onNext={nextPage}
          onToc={goToToc}
          canGoPrev={currentPageIndex > 0}
          canGoNext={currentPageIndex < totalPages - 1}
        />
      )}

      <FontSizeControl
        visible={showFontModal}
        currentSize={fontSize}
        onSelect={handleFontSizeChange}
        onClose={() => setShowFontModal(false)}
      />

      <SelectionMenu
        visible={showSelectionMenu}
        selectedText={selectedEntry?.text || ''}
        position={menuPosition}
        onCopy={handleCopyText}
        onCreateEntry={handleCreateEntry}
        onCreateSong={handleCreateSong}
        onClose={closeSelectionMenu}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: Z_INDEX.dropdown,
      overflow: 'hidden',
    },
    headerAndroidFallback: {
      backgroundColor: 'rgba(18, 18, 18, 0.65)',
    },
    headerGradientOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(40, 20, 60, 0.25)',
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 14,
    },
    headerButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.background.subtle,
    },
    contentContainer: {
      flex: 1,
    },
    pageContainer: {
      flex: 1,
    },
  });
