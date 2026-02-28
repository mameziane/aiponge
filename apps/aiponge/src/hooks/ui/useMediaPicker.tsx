import { useState, useCallback } from 'react';
import { Platform, Alert, ActionSheetIOS } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';

export interface MediaPickerOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
}

export interface MediaPickerResult {
  uri: string;
  width: number;
  height: number;
  type?: string;
  fileName?: string;
}

interface UseMediaPickerReturn {
  pickMedia: () => Promise<MediaPickerResult | null>;
  pickFromLibrary: () => Promise<MediaPickerResult | null>;
  takePhoto: () => Promise<MediaPickerResult | null>;
  isLoading: boolean;
}

const defaultOptions: MediaPickerOptions = {
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

export function useMediaPicker(options: MediaPickerOptions = {}): UseMediaPickerReturn {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const mergedOptions = { ...defaultOptions, ...options };

  const requestLibraryPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('mediaPicker.permissionRequired'), t('mediaPicker.libraryPermission'));
      return false;
    }
    return true;
  }, [t]);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return true;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('mediaPicker.permissionRequired'), t('mediaPicker.cameraPermission'));
      return false;
    }
    return true;
  }, [t]);

  const pickFromLibrary = useCallback(async (): Promise<MediaPickerResult | null> => {
    try {
      setIsLoading(true);

      const hasPermission = await requestLibraryPermission();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: mergedOptions.allowsEditing,
        aspect: mergedOptions.aspect,
        quality: mergedOptions.quality,
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const asset = result.assets[0];
      logger.debug('[useMediaPicker] Image selected from library', { uri: asset.uri });

      return {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        type: asset.mimeType,
        fileName: asset.fileName || undefined,
      };
    } catch (error) {
      logger.error('[useMediaPicker] Error picking from library', { error });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [mergedOptions, requestLibraryPermission]);

  const takePhoto = useCallback(async (): Promise<MediaPickerResult | null> => {
    try {
      setIsLoading(true);

      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: mergedOptions.allowsEditing,
        aspect: mergedOptions.aspect,
        quality: mergedOptions.quality,
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const asset = result.assets[0];
      logger.debug('[useMediaPicker] Photo taken with camera', { uri: asset.uri });

      return {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        type: asset.mimeType,
        fileName: asset.fileName || undefined,
      };
    } catch (error) {
      logger.error('[useMediaPicker] Error taking photo', { error });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [mergedOptions, requestCameraPermission]);

  const pickMedia = useCallback(async (): Promise<MediaPickerResult | null> => {
    return new Promise(resolve => {
      const options = [t('mediaPicker.takePhoto'), t('mediaPicker.chooseFromLibrary'), t('common.cancel')];

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: 2,
          },
          async buttonIndex => {
            if (buttonIndex === 0) {
              resolve(await takePhoto());
            } else if (buttonIndex === 1) {
              resolve(await pickFromLibrary());
            } else {
              resolve(null);
            }
          }
        );
      } else {
        Alert.alert(t('mediaPicker.selectSource'), undefined, [
          {
            text: t('mediaPicker.takePhoto'),
            onPress: async () => resolve(await takePhoto()),
          },
          {
            text: t('mediaPicker.chooseFromLibrary'),
            onPress: async () => resolve(await pickFromLibrary()),
          },
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () => resolve(null),
          },
        ]);
      }
    });
  }, [t, takePhoto, pickFromLibrary]);

  return {
    pickMedia,
    pickFromLibrary,
    takePhoto,
    isLoading,
  };
}
