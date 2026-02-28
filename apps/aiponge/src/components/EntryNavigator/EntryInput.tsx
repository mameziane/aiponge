import { memo, RefObject, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity as RNTouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  Modal,
  Dimensions,
  Pressable,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { Z_INDEX, BORDER_RADIUS } from '@/theme/constants';
import { useTranslation } from '@/i18n';
import { createStyles } from './styles';
import { LoadingState } from '../shared';
import type { EntryImage } from '@/types/profile.types';

const MAX_ENTRY_LENGTH = 5000;
const MAX_IMAGES = 4;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DELETE_THRESHOLD = -50;

interface SwipeableImageProps {
  uri: string;
  onDelete: () => void;
  onPress: () => void;
  onLongPress?: () => void;
  testIdPrefix: string;
  isUploading?: boolean;
}

const SwipeableImage = memo(function SwipeableImage({
  uri,
  onDelete,
  onPress,
  onLongPress,
  testIdPrefix,
  isUploading = false,
}: SwipeableImageProps) {
  const colors = useThemeColors();
  const imgStyles = useMemo(() => createImageStyles(colors), [colors]);
  const translateY = useSharedValue(0);
  const deleteOpacity = useSharedValue(0);

  const triggerDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .activeOffsetY(-10)
    .failOffsetX([-20, 20])
    .onUpdate(event => {
      'worklet';
      if (event.translationY < 0) {
        translateY.value = Math.max(event.translationY, -80);
        deleteOpacity.value = interpolate(event.translationY, [0, DELETE_THRESHOLD], [0, 1], Extrapolation.CLAMP);
      }
    })
    .onEnd(event => {
      'worklet';
      if (event.translationY < DELETE_THRESHOLD) {
        runOnJS(triggerDelete)();
      }
      translateY.value = withSpring(0);
      deleteOpacity.value = withSpring(0);
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const trashStyle = useAnimatedStyle(() => ({
    opacity: deleteOpacity.value,
    transform: [{ scale: interpolate(deleteOpacity.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={imgStyles.swipeableContainer}>
      <Animated.View style={[imgStyles.trashIconContainer, trashStyle]}>
        <Ionicons name="trash" size={24} color={colors.semantic.error} />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[imgStyles.imagePreviewContainer, imageStyle]}>
          <RNTouchableOpacity onPress={onPress} activeOpacity={0.8} testID={`${testIdPrefix}-pressable`}>
            <Image source={{ uri }} style={imgStyles.imagePreview} testID={`${testIdPrefix}-view`} />
            {isUploading && (
              <View style={imgStyles.uploadingOverlay}>
                <ActivityIndicator size="small" color={colors.brand.primary} />
              </View>
            )}
          </RNTouchableOpacity>
        </Animated.View>
      </GestureDetector>
      {!isUploading && (
        <RNTouchableOpacity
          style={imgStyles.createSongButton}
          onPress={() => onLongPress?.()}
          testID={`${testIdPrefix}-create-song`}
        >
          <Ionicons name="musical-notes" size={16} color={colors.absolute.white} />
        </RNTouchableOpacity>
      )}
    </View>
  );
});

interface EntryInputProps {
  textInputRef: RefObject<TextInput | null>;
  editedContent: string;
  interimTranscript: string;
  isNewEntryMode: boolean;
  isLoading: boolean;
  isListening: boolean;
  isCurrentEntrySelected: boolean;
  speechSupported: boolean;
  pendingImageUris: string[];
  currentEntryImages: EntryImage[];
  isUploadingImage: boolean;
  onContentChange: (content: string) => void;
  onVoiceInput: () => Promise<void>;
  onRemoveImage: (imageId?: string, pendingIndex?: number) => void;
  onPickImage: () => Promise<void>;
  onImageLongPress?: (imageUri: string) => void;
}

export const EntryInput = memo(function EntryInput({
  textInputRef,
  editedContent,
  interimTranscript,
  isNewEntryMode,
  isLoading,
  isListening,
  isCurrentEntrySelected,
  speechSupported,
  pendingImageUris,
  currentEntryImages,
  isUploadingImage,
  onContentChange,
  onVoiceInput,
  onRemoveImage,
  onPickImage,
  onImageLongPress,
}: EntryInputProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inpStyles = useMemo(() => createInputStyles(colors), [colors]);
  const imgStyles = useMemo(() => createImageStyles(colors), [colors]);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);

  const savedImages = currentEntryImages || [];
  const totalImages = savedImages.length + pendingImageUris.length;
  const hasImages = totalImages > 0;

  if (isLoading) {
    return (
      <View style={[styles.contentContainer, isCurrentEntrySelected && styles.contentContainerSelected]}>
        <LoadingState fullScreen={false} message={t('create.loadingEntries')} />
      </View>
    );
  }

  const currentLength = editedContent.length;
  const isNearLimit = currentLength > MAX_ENTRY_LENGTH * 0.9;
  const isAtLimit = currentLength >= MAX_ENTRY_LENGTH;

  return (
    <View style={[styles.contentContainer, isCurrentEntrySelected && styles.contentContainerSelected]}>
      <View style={styles.inputWrapper}>
        <TextInput
          ref={textInputRef}
          style={[
            styles.entryInput,
            styles.entryInputWithMic,
            isCurrentEntrySelected && styles.entryInputSelected,
            isListening && styles.entryInputListening,
          ]}
          value={isListening && interimTranscript ? `${editedContent} ${interimTranscript}` : editedContent}
          onChangeText={onContentChange}
          placeholder={isNewEntryMode ? t('create.newEntryPlaceholder') : t('create.noEntryContent')}
          placeholderTextColor={colors.text.tertiary}
          multiline
          scrollEnabled={true}
          editable={!isListening}
          maxLength={MAX_ENTRY_LENGTH}
          testID="input-entry-content"
        />
        <Text
          style={[styles.charCount, isNearLimit && styles.charCountWarning, isAtLimit && styles.charCountLimit]}
          testID="text-char-count"
        >
          {currentLength}/{MAX_ENTRY_LENGTH}
        </Text>
        <RNTouchableOpacity
          style={[
            styles.micButton,
            isListening && styles.micButtonActive,
            !speechSupported && styles.micButtonDisabled,
          ]}
          onPress={onVoiceInput}
          disabled={isLoading}
          testID="button-voice-input"
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={24}
            color={isListening ? colors.brand.primary : speechSupported ? colors.text.secondary : colors.text.tertiary}
          />
        </RNTouchableOpacity>
        <RNTouchableOpacity
          style={[
            inpStyles.imageButton,
            (isUploadingImage || totalImages >= MAX_IMAGES) && inpStyles.imageButtonDisabled,
          ]}
          onPress={onPickImage}
          disabled={isUploadingImage || totalImages >= MAX_IMAGES}
          testID="button-pick-image"
        >
          {isUploadingImage ? (
            <ActivityIndicator size="small" color={colors.text.secondary} />
          ) : (
            <Ionicons
              name={totalImages > 0 ? 'images' : 'image-outline'}
              size={22}
              color={totalImages < MAX_IMAGES ? colors.text.secondary : colors.text.tertiary}
            />
          )}
        </RNTouchableOpacity>
      </View>
      {hasImages && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={imgStyles.imageGallery}
          contentContainerStyle={imgStyles.imageGalleryContent}
        >
          {savedImages.map((image, index) => (
            <SwipeableImage
              key={image.id}
              uri={image.url}
              onDelete={() => onRemoveImage(image.id)}
              onPress={() => setFullscreenImageUrl(image.url)}
              onLongPress={onImageLongPress ? () => onImageLongPress(image.url) : undefined}
              testIdPrefix={`button-image-${index}`}
            />
          ))}
          {pendingImageUris.map((uri, index) => (
            <SwipeableImage
              key={`pending-${index}`}
              uri={uri}
              onDelete={() => onRemoveImage(undefined, index)}
              onPress={() => setFullscreenImageUrl(uri)}
              onLongPress={onImageLongPress ? () => onImageLongPress(uri) : undefined}
              testIdPrefix={`button-pending-image-${index}`}
              isUploading={isUploadingImage}
            />
          ))}
        </ScrollView>
      )}
      {isListening && (
        <View style={styles.listeningIndicator}>
          <View style={styles.listeningDot} />
          <Text style={styles.listeningText}>{t('create.listening')}</Text>
        </View>
      )}

      <Modal
        visible={!!fullscreenImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImageUrl(null)}
        statusBarTranslucent
      >
        <Pressable style={imgStyles.fullscreenOverlay} onPress={() => setFullscreenImageUrl(null)}>
          <Image source={{ uri: fullscreenImageUrl || '' }} style={imgStyles.fullscreenImage} resizeMode="contain" />
          <RNTouchableOpacity
            style={imgStyles.closeButton}
            onPress={() => setFullscreenImageUrl(null)}
            testID="button-close-fullscreen-image"
          >
            <Ionicons name="close" size={28} color={colors.text.primary} />
          </RNTouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
});

const createInputStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    imageButton: {
      position: 'absolute',
      right: 8,
      bottom: 28,
      padding: 6,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.tertiary,
    },
    imageButtonDisabled: {
      opacity: 0.4,
    },
  });

const createImageStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    imageGallery: {
      marginTop: 4,
      maxHeight: 100,
    },
    imageGalleryContent: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingRight: 8,
      paddingBottom: 4,
    },
    swipeableContainer: {
      position: 'relative',
      width: 100,
      height: 75,
      overflow: 'visible',
    },
    trashIconContainer: {
      position: 'absolute',
      bottom: -4,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.semantic.errorLight,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 0,
    },
    imagePreviewContainer: {
      position: 'relative',
      zIndex: 1,
      overflow: 'visible',
    },
    imagePreview: {
      width: 100,
      height: 75,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.secondary,
    },
    removeButton: {
      position: 'absolute',
      top: 4,
      right: -8,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
    },
    uploadingOverlay: {
      position: 'absolute',
      top: 12,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay.medium,
      borderRadius: BORDER_RADIUS.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    createSongButton: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
      elevation: 5,
      zIndex: Z_INDEX.dropdown,
      borderWidth: 2,
      borderColor: colors.background.primary,
    },
    imageBadge: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      backgroundColor: colors.overlay.black[60],
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    imageBadgePending: {
      backgroundColor: colors.brand.primary,
    },
    imageBadgeText: {
      color: colors.text.primary,
      fontSize: 10,
      fontWeight: '600',
    },
    imageCountBadge: {
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    imageCountText: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: '500',
    },
    fullscreenOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[95],
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullscreenImage: {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT * 0.8,
    },
    closeButton: {
      position: 'absolute',
      top: 50,
      right: 20,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.overlay.medium,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
