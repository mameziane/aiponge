import React, { memo, useMemo, type ComponentProps } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { fontFamilies } from '../../theme/typography';
import { normalizeMediaUrl } from '../../lib/apiConfig';
import { useTranslation } from '../../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GRID_COLUMNS = 3;
const GRID_PADDING = 8;
const CARD_GAP = 3;
const GRID_CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - CARD_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const GRID_CARD_HEIGHT = GRID_CARD_WIDTH * 1.52;

const COVER_WIDTH = 120;
const COVER_HEIGHT = COVER_WIDTH * 1.5;

const CATEGORY_COLORS: Record<string, string> = {
  anxiety: '#3b5998',
  growth: '#1a6b3c',
  purpose: '#6b3fa0',
  love: '#8b2252',
  grief: '#2c5364',
  gratitude: '#7a5c00',
  mindfulness: '#2d6a4f',
  resilience: '#1d3557',
  wisdom: '#4a3728',
  meditation: '#2c4a7c',
  philosophy: '#3d2b1f',
  poetry: '#5c2d91',
  fiction: '#1a3a5c',
  dreams: '#1a1a4e',
  scientific: '#003366',
  children: '#cc4700',
  educational: '#0d4a6b',
  affirmations: '#7a3600',
  memoir: '#4a2c0a',
  personal: '#1c3a2f',
};

const CATEGORY_ICONS: Record<string, string> = {
  anxiety: 'leaf-outline',
  growth: 'rocket-outline',
  purpose: 'compass-outline',
  love: 'heart-outline',
  grief: 'water-outline',
  gratitude: 'sunny-outline',
  mindfulness: 'flower-outline',
  resilience: 'shield-outline',
  wisdom: 'book-outline',
};

export interface BookCardData {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverIllustrationUrl?: string;
  author?: string;
  era?: string;
  tradition?: string;
  category: string;
  language?: string;
  visibility?: string;
  status?: string;
  chapterCount: number;
  entryCount: number;
  createdAt?: string;
  publishedAt?: string;
  typeId?: string;
  tags?: string[];
  themes?: string[];
  progressPercent?: number;
  userId?: string;
}

export interface BookCardActions {
  onEdit?: (book: BookCardData) => void;
  onDelete?: (book: BookCardData) => void;
  onPublish?: (book: BookCardData) => void;
  onGenerateCover?: (book: BookCardData) => void;
}

interface BookCardProps {
  book: BookCardData;
  layout: 'grid' | 'list' | 'carousel';
  isSaved?: boolean;
  showActions?: boolean;
  actions?: BookCardActions;
  categoryColor?: string;
  onPress: (book: BookCardData) => void;
  columnIndex?: number;
  showProgress?: boolean;
  onClone?: (book: BookCardData) => void;
  onManage?: (book: BookCardData) => void;
}

function BookCover({
  coverUrl,
  style,
  category,
}: {
  coverUrl?: string;
  style: Record<string, unknown>;
  category?: string;
}) {
  if (coverUrl) {
    return (
      <Image
        source={{ uri: normalizeMediaUrl(coverUrl) }}
        style={style}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
      />
    );
  }
  const iconName = (category && CATEGORY_ICONS[category]) || 'book-outline';
  return (
    <View style={[style, { backgroundColor: '#2a2a3e', justifyContent: 'center', alignItems: 'center' }]}>
      <Ionicons name={iconName as ComponentProps<typeof Ionicons>['name']} size={38} color="rgba(255,255,255,0.85)" />
    </View>
  );
}

function GridBookCard({
  book,
  isSaved,
  onPress,
  columnIndex = 0,
  showProgress,
  onClone,
  onManage,
  styles,
  colors,
}: BookCardProps & { styles: ReturnType<typeof createStyles>; colors: ColorScheme }) {
  const placeholderBg = CATEGORY_COLORS[book.category] || CATEGORY_COLORS[book.typeId || ''] || '#1c2a3a';
  const leftMargin = columnIndex % GRID_COLUMNS === 0 ? 0 : CARD_GAP;

  return (
    <TouchableOpacity
      style={[styles.gridCard, { marginLeft: leftMargin }]}
      onPress={() => onPress(book)}
      activeOpacity={0.82}
    >
      <View style={styles.gridCoverContainer}>
        {book.coverIllustrationUrl ? (
          <Image
            source={{ uri: normalizeMediaUrl(book.coverIllustrationUrl) }}
            style={styles.gridCover}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.gridCover, styles.gridCoverPlaceholder, { backgroundColor: placeholderBg }]}>
            <Ionicons
              name={(CATEGORY_ICONS[book.category] || 'book-outline') as ComponentProps<typeof Ionicons>['name']}
              size={38}
              color="rgba(255,255,255,0.85)"
            />
          </View>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.88)']}
          locations={[0.3, 0.65, 1]}
          style={styles.gridGradient}
        >
          <Text style={styles.gridOverlayTitle} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author && (
            <Text style={styles.gridOverlayAuthor} numberOfLines={1}>
              {book.author}
            </Text>
          )}
        </LinearGradient>

        {!onManage && isSaved && (
          <View style={styles.savedBadge}>
            <Ionicons name="bookmark" size={11} color="#ff6b9d" />
          </View>
        )}

        {onManage ? (
          <TouchableOpacity
            style={styles.manageButton}
            onPress={e => {
              e.stopPropagation();
              onManage(book);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Ionicons name="ellipsis-horizontal" size={12} color="rgba(255,255,255,0.95)" />
          </TouchableOpacity>
        ) : onClone ? (
          <TouchableOpacity
            style={styles.cloneButton}
            onPress={e => {
              e.stopPropagation();
              onClone(book);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.8}
          >
            <Ionicons name="copy-outline" size={11} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        ) : null}

        {showProgress && book.progressPercent != null && book.progressPercent > 0 && (
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.min(book.progressPercent, 100)}%` as `${number}%` }]} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const BookCard = memo(
  function BookCard({
    book,
    layout,
    isSaved = false,
    showActions = false,
    actions,
    categoryColor,
    onPress,
    columnIndex = 0,
    showProgress = false,
    onClone,
    onManage,
  }: BookCardProps) {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const categoryColors = colors.category as Record<string, string>;
    const chipColor = categoryColor || categoryColors[book.category] || colors.brand.primary;
    const iconName = CATEGORY_ICONS[book.category] || 'book-outline';

    if (layout === 'carousel') {
      return (
        <TouchableOpacity style={styles.carouselCard} onPress={() => onPress(book)} activeOpacity={0.85}>
          <View style={styles.carouselCoverContainer}>
            <BookCover coverUrl={book.coverIllustrationUrl} style={styles.carouselCover} category={book.category} />
            {isSaved && (
              <View style={styles.carouselSavedBadge}>
                <Ionicons name="bookmark" size={14} color={colors.brand.pink} />
              </View>
            )}
            {onClone && (
              <TouchableOpacity
                style={styles.cloneButton}
                onPress={e => {
                  e.stopPropagation();
                  onClone(book);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.8}
              >
                <Ionicons name="copy-outline" size={13} color={colors.absolute.white} />
              </TouchableOpacity>
            )}
            {showProgress && book.progressPercent != null && book.progressPercent > 0 && (
              <View style={styles.progressBarContainer}>
                <View
                  style={[styles.progressBar, { width: `${Math.min(book.progressPercent, 100)}%` as `${number}%` }]}
                />
              </View>
            )}
          </View>
          <View style={styles.carouselInfo}>
            <Text style={styles.carouselTitle} numberOfLines={2}>
              {book.title}
            </Text>
            {book.author && (
              <Text style={styles.carouselAuthor} numberOfLines={1}>
                {book.author}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    if (layout === 'grid') {
      return (
        <GridBookCard
          book={book}
          layout={layout}
          isSaved={isSaved}
          showActions={showActions}
          actions={actions}
          categoryColor={categoryColor}
          onPress={onPress}
          columnIndex={columnIndex}
          showProgress={showProgress}
          onClone={onClone}
          onManage={onManage}
          styles={styles}
          colors={colors}
        />
      );
    }

    const renderStatusBadge = (status: string) => {
      const statusColors: Record<string, string> = {
        draft: colors.text.tertiary,
        active: colors.brand.primary,
        archived: colors.semantic.error,
      };
      return (
        <View style={[styles.statusBadge, { backgroundColor: statusColors[status] || colors.text.tertiary }]}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      );
    };

    return (
      <TouchableOpacity style={styles.listCard} onPress={() => onPress(book)} activeOpacity={0.7}>
        <View style={styles.listCoverContainer}>
          <BookCover coverUrl={book.coverIllustrationUrl} style={styles.listCover} category={book.category} />
          {book.status && renderStatusBadge(book.status)}
        </View>

        <View style={styles.listInfo}>
          <Text style={styles.listTitle} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author && (
            <Text style={styles.listAuthor} numberOfLines={1}>
              {book.author}
            </Text>
          )}
          <Text style={styles.listMeta}>
            {book.chapterCount} chapters · {book.entryCount} entries
          </Text>
          <View style={styles.bookTags}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{book.category}</Text>
            </View>
            {book.visibility && (
              <View style={[styles.tag, styles.visibilityTag]}>
                <Text style={styles.tagText}>{book.visibility}</Text>
              </View>
            )}
          </View>
        </View>

        {showActions && actions && (
          <View style={styles.bookActions}>
            {actions.onEdit && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => actions.onEdit?.(book)}>
                <Ionicons name="pencil-outline" size={18} color={colors.text.primary} />
              </TouchableOpacity>
            )}
            {book.status === 'draft' && actions.onPublish && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => actions.onPublish?.(book)}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.brand.primary} />
              </TouchableOpacity>
            )}
            {actions.onGenerateCover && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => actions.onGenerateCover?.(book)}>
                <Ionicons name="image-outline" size={18} color={colors.brand.secondary} />
              </TouchableOpacity>
            )}
            {actions.onDelete && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => actions.onDelete?.(book)}>
                <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.book.id === nextProps.book.id &&
      prevProps.book.title === nextProps.book.title &&
      prevProps.book.subtitle === nextProps.book.subtitle &&
      prevProps.book.description === nextProps.book.description &&
      prevProps.book.coverIllustrationUrl === nextProps.book.coverIllustrationUrl &&
      prevProps.book.author === nextProps.book.author &&
      prevProps.book.category === nextProps.book.category &&
      prevProps.book.tradition === nextProps.book.tradition &&
      prevProps.book.visibility === nextProps.book.visibility &&
      prevProps.book.chapterCount === nextProps.book.chapterCount &&
      prevProps.book.entryCount === nextProps.book.entryCount &&
      prevProps.book.status === nextProps.book.status &&
      prevProps.book.progressPercent === nextProps.book.progressPercent &&
      prevProps.layout === nextProps.layout &&
      prevProps.isSaved === nextProps.isSaved &&
      prevProps.showActions === nextProps.showActions &&
      prevProps.actions === nextProps.actions &&
      prevProps.categoryColor === nextProps.categoryColor &&
      prevProps.onPress === nextProps.onPress &&
      prevProps.columnIndex === nextProps.columnIndex &&
      prevProps.showProgress === nextProps.showProgress
    );
  }
);

export function CreateBookCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={[styles.listCard, styles.createCard]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.listCoverContainer, styles.createCoverContainer]}>
        <View style={styles.createCoverPlaceholder}>
          <Ionicons name="add-circle" size={48} color={colors.brand.primary} />
        </View>
      </View>
      <View style={styles.listInfo}>
        <Text style={[styles.listTitle, styles.createTitle]}>
          {t('librarian.books.createBook') || 'Create New Book'}
        </Text>
        <Text style={styles.listMeta}>{t('librarian.books.createDescription') || 'Generate a book with AI'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    carouselCard: {
      width: COVER_WIDTH,
      marginRight: 12,
    },
    carouselCoverContainer: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      borderRadius: 6,
      overflow: 'hidden',
      position: 'relative',
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 8,
      backgroundColor: colors.background.tertiary,
    },
    carouselCover: {
      width: '100%',
      height: '100%',
    },
    carouselCoverPlaceholder: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
    },
    carouselPlaceholderTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: 8,
    },
    carouselSavedBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: colors.overlay.black[60],
      borderRadius: 10,
      padding: 3,
    },
    cloneButton: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 8,
      padding: 4,
    },
    manageButton: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: 'rgba(0,0,0,0.60)',
      borderRadius: 8,
      padding: 4,
    },
    progressBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    progressBar: {
      height: '100%',
      backgroundColor: colors.brand.primary,
      borderRadius: 1.5,
    },
    carouselInfo: {
      marginTop: 8,
      paddingHorizontal: 2,
    },
    carouselTitle: {
      fontSize: 13,
      fontWeight: '600',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      lineHeight: 17,
    },
    carouselAuthor: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    gridCard: {
      width: GRID_CARD_WIDTH,
      height: GRID_CARD_HEIGHT,
      marginBottom: CARD_GAP,
    },
    gridCoverContainer: {
      width: '100%',
      height: '100%',
      borderRadius: 4,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#1a1a2e',
      shadowColor: '#000',
      shadowOffset: { width: 1, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 6,
    },
    gridCover: {
      width: '100%',
      height: '100%',
    },
    gridCoverPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 6,
      paddingBottom: 8,
      paddingTop: 28,
    },
    gridOverlayTitle: {
      fontSize: 11,
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      color: '#ffffff',
      lineHeight: 14,
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    gridOverlayAuthor: {
      fontSize: 9,
      fontWeight: '400',
      color: 'rgba(255,255,255,0.75)',
      marginTop: 2,
      textShadowColor: 'rgba(0,0,0,0.8)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    savedBadge: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 8,
      padding: 3,
    },
    listCard: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    createCard: {
      borderStyle: 'dashed',
      borderColor: colors.brand.primary,
      backgroundColor: colors.background.primary,
    },
    createCoverContainer: {
      borderStyle: 'dashed',
    },
    createCoverPlaceholder: {
      width: 80,
      height: 100,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
      borderStyle: 'dashed',
    },
    createTitle: {
      color: colors.brand.primary,
    },
    listCoverContainer: {
      width: 70,
      height: 100,
      borderRadius: BORDER_RADIUS.sm,
      overflow: 'hidden',
      position: 'relative',
    },
    listCover: {
      width: '100%',
      height: '100%',
    },
    listCoverPlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.background.tertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusBadge: {
      position: 'absolute',
      top: 4,
      left: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.absolute.white,
      textTransform: 'uppercase',
    },
    listInfo: {
      flex: 1,
      marginLeft: 12,
      justifyContent: 'center',
    },
    listTitle: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    listAuthor: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    listMeta: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 6,
    },
    bookTags: {
      flexDirection: 'row',
      gap: 6,
    },
    tag: {
      backgroundColor: colors.background.tertiary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    visibilityTag: {
      backgroundColor: colors.brand.primary + '30',
    },
    tagText: {
      fontSize: 10,
      color: colors.text.secondary,
      textTransform: 'capitalize',
    },
    bookActions: {
      justifyContent: 'center',
      gap: 8,
    },
    actionBtn: {
      padding: 8,
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
    },
  });
