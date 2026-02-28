import { useState, ReactNode, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text, ViewStyle } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { normalizeMediaUrl } from '../../lib/apiConfig';

export interface ArtworkImageProps {
  uri?: string | null;
  size: number;
  borderRadius?: number;
  contentFit?: ImageContentFit;
  testID?: string;
  placeholderTestId?: string;
  wrapperStyle?: ViewStyle;
  children?: ReactNode;
  fallbackIcon?: ReactNode;
}

/**
 * Optimized artwork image component using expo-image
 * - Progressive loading with placeholder
 * - Memory + disk caching
 * - Graceful error handling with retry
 * - Optimized for low bandwidth connections
 * - Single container for overlays to prevent double-wrapping
 */
export function ArtworkImage({
  uri,
  size,
  borderRadius = 8,
  contentFit = 'cover',
  testID,
  placeholderTestId,
  wrapperStyle,
  children,
  fallbackIcon,
}: ArtworkImageProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const normalizedUri = useMemo(() => normalizeMediaUrl(uri), [uri]);

  const [isLoading, setIsLoading] = useState(!!normalizedUri);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Tiny blur placeholder for progressive loading with unique ID
  const blurhash = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    setRetryKey(prev => prev + 1);
  };

  // Always render the same container structure for stable virtualization
  return (
    <View
      style={[styles.container, wrapperStyle, { width: size, height: size, borderRadius }]}
      testID={placeholderTestId || `artwork-placeholder-${normalizedUri || 'no-uri'}`}
    >
      {/* Always render Image element for stable React tree - use transparent source when no URI */}
      <Image
        key={normalizedUri ? retryKey : 'no-uri'}
        source={
          normalizedUri
            ? { uri: normalizedUri }
            : {
                uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
              }
        }
        placeholder={normalizedUri ? { blurhash } : undefined}
        contentFit={contentFit}
        transition={200}
        cachePolicy="memory-disk"
        style={[styles.image, { borderRadius, opacity: normalizedUri ? 1 : 0 }]}
        onLoad={normalizedUri ? handleLoad : undefined}
        onError={normalizedUri ? handleError : undefined}
        testID={testID}
      />

      {/* Overlays - render based on state */}
      {!normalizedUri && (
        <View style={[styles.fallbackContainer, StyleSheet.absoluteFillObject]}>
          {fallbackIcon || <Ionicons name="musical-notes" size={size * 0.3} color={colors.text.tertiary} />}
        </View>
      )}

      {normalizedUri && isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.brand.primary} />
        </View>
      )}

      {normalizedUri && hasError && (
        <TouchableOpacity
          style={[styles.errorContainer, StyleSheet.absoluteFillObject]}
          onPress={handleRetry}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('components.artworkImage.retryLoading')}
          testID={testID ? `${testID}-error` : 'artwork-error'}
        >
          <Ionicons name="musical-notes" size={size * 0.3} color={colors.text.tertiary} />
          <Text style={styles.retryText}>{t('components.artworkImage.tapToRetry')}</Text>
        </TouchableOpacity>
      )}

      {/* Children (overlays from parent components) */}
      {children}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background.secondary,
      overflow: 'hidden',
      position: 'relative',
    },
    errorContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.background.secondary,
    },
    fallbackContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
    },
    image: {
      width: '100%',
      height: '100%',
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
    },
    retryText: {
      fontSize: 10,
      color: colors.text.tertiary,
      marginTop: 4,
    },
  });
