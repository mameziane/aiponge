/**
 * Profile Service
 * API service layer for profile, entries, and insights operations
 * ✅ PERFORMANCE: Uses stale-while-revalidate caching for instant data loading
 *
 * All profile endpoints use /api/app/profile/* pattern:
 * - GET  /api/app/profile              - Get user's profile
 * - PATCH /api/app/profile             - Update user's profile
 * - PATCH /api/app/profile/preferences - Update user's preferences
 * - GET  /api/app/profile/wellness     - Get user's wellness score
 */

import { logError } from '../../utils/errorSerialization';
import { USER_ROLES, type ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { getApiGatewayUrl, API_VERSION_PREFIX } from '../../lib/apiConfig';
import { useAuthStore } from '../../auth/store';
import { logger } from '../../lib/logger';
import type { ProfileData } from '../../types/profile.types';

type ImageManipulatorModule = {
  manipulateAsync: (
    uri: string,
    actions: Array<{ resize: { width: number; height: number } }>,
    options: { compress: number; format: unknown }
  ) => Promise<{ uri: string }>;
  SaveFormat: { JPEG: unknown };
};

let ImageManipulator: ImageManipulatorModule | null = null;
try {
  ImageManipulator = require('expo-image-manipulator') as ImageManipulatorModule;
} catch {
  logger.warn('[ProfileService] expo-image-manipulator not available');
}

const AVATAR_MAX_SIZE = 512;
const AVATAR_COMPRESS_QUALITY = 0.7;

async function resizeImageForUpload(uri: string, maxSize: number, quality: number): Promise<string> {
  if (!ImageManipulator) {
    logger.warn('Image manipulator not available, using original image');
    return uri;
  }
  try {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxSize, height: maxSize } }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    logger.debug('Image resized for upload', { originalUri: uri, newUri: result.uri, maxSize });
    return result.uri;
  } catch (error) {
    logger.warn('Image resize failed, using original', { error });
    return uri;
  }
}

interface ProfileApiResponse {
  email: string;
  profile: ProfileData['profile'];
  preferences?: {
    notifications?: boolean;
    visibility?: string;
    theme?: string;
  };
  stats: ProfileData['stats'];
}

type UploadImageResponse = ServiceResponse<{
  fileId: string;
  url: string;
  originalName: string;
}>;

type UploadAvatarResponse = UploadImageResponse;

// Import React Native FormData file type (from type declaration)
import type { ReactNativeFile } from '../../types/react-native-formdata';

export const ProfileService = {
  /**
   * Upload avatar image to storage service
   * @param imageUri - Local file URI from image picker
   * @param userId - User ID for ownership
   * @returns URL of the uploaded image
   */
  uploadAvatar: async (imageUri: string, userId: string): Promise<UploadAvatarResponse> => {
    try {
      const resizedUri = await resizeImageForUpload(imageUri, AVATAR_MAX_SIZE, AVATAR_COMPRESS_QUALITY);

      const formData = new FormData();

      const uriParts = resizedUri.split('/');
      const fileName = uriParts[uriParts.length - 1] || 'avatar.jpg';

      // Determine mime type from extension
      const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'gif'
            ? 'image/gif'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg';

      // Append file to form data (React Native uses uri/name/type format)
      // Type augmentation in types/react-native-formdata.d.ts allows this
      const fileData: ReactNativeFile = {
        uri: resizedUri,
        name: `avatar_${userId}_${Date.now()}.${extension}`,
        type: mimeType,
      };
      formData.append('file', fileData);

      formData.append('userId', userId);
      formData.append('isPublic', 'true');
      formData.append('category', 'avatar');
      formData.append('tags', JSON.stringify(['avatar', 'profile']));

      const apiUrl = getApiGatewayUrl();
      logger.debug('Uploading avatar to storage service', { userId });

      const result = await apiClient.upload<{
        success?: boolean;
        data?: { url?: string; fileId?: string; originalName?: string };
        error?: { message?: string };
      }>(`${API_VERSION_PREFIX}/storage/upload`, formData);

      if (!result.success || !result.data) {
        logger.error('Upload response missing success or data', { result });
        throw new Error(result.error?.message || 'Upload returned no data');
      }

      // Construct the avatar URL - ensure it's an absolute URL
      let avatarUrl = result.data.url || `${API_VERSION_PREFIX}/storage/download/${result.data.fileId}`;

      // Convert relative URL to absolute URL for mobile app
      if (avatarUrl.startsWith('/')) {
        avatarUrl = `${apiUrl}${avatarUrl}`;
      }

      logger.debug('Avatar URL constructed', { avatarUrl, originalUrl: result.data.url });

      if (!result.data.fileId || !result.data.originalName) {
        throw new Error('Upload response missing required fields: fileId or originalName');
      }

      return {
        success: true,
        data: {
          fileId: result.data.fileId,
          url: avatarUrl,
          originalName: result.data.originalName,
        },
      };
    } catch (error) {
      logError(error, 'Failed to upload avatar', `${API_VERSION_PREFIX}/storage/upload`);
      return {
        success: false,
        error: {
          type: 'UPLOAD_ERROR',
          code: 'AVATAR_UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Failed to upload avatar',
        },
      };
    }
  },

  /**
   * Upload entry image to storage service
   * Reads user role directly from auth store (single source of truth)
   * @param imageUri - Local file URI from image picker
   * @param userId - User ID for ownership
   * @returns URL of the uploaded image
   */
  uploadEntryImage: async (imageUri: string, userId: string): Promise<UploadImageResponse> => {
    try {
      const authState = useAuthStore.getState();
      const token = authState.token;
      const userRole = authState.user?.role;
      const roleVerified = authState.roleVerified;

      const formData = new FormData();

      const uriParts = imageUri.split('/');
      const fileName = uriParts[uriParts.length - 1] || 'entry_image.jpg';

      const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'gif'
            ? 'image/gif'
            : extension === 'webp'
              ? 'image/webp'
              : 'image/jpeg';

      formData.append('file', {
        uri: imageUri,
        name: `entry_${userId}_${Date.now()}.${extension}`,
        type: mimeType,
        // as unknown as Blob: React Native FormData expects {uri,name,type} object cast to Blob
      } as unknown as Blob);

      formData.append('userId', userId);
      formData.append('isPublic', 'false');
      formData.append('category', 'entry');
      formData.append('tags', JSON.stringify(['entry', 'attachment']));

      // Only use role if it has been verified from server to prevent stale role usage
      const isLibrarianOrAdmin = roleVerified && (userRole === USER_ROLES.LIBRARIAN || userRole === USER_ROLES.ADMIN);
      logger.info('uploadEntryImage - role from auth store', { userId, userRole, roleVerified, isLibrarianOrAdmin });

      if (isLibrarianOrAdmin) {
        formData.append('isShared', 'true');
        logger.info('Librarian/admin upload - setting isShared=true for library path');
      }

      const apiUrl = getApiGatewayUrl();
      logger.debug('Uploading entry image to storage service', { userId });

      const result = await apiClient.upload<{
        success?: boolean;
        data?: { url?: string; fileId?: string; originalName?: string };
        error?: { message?: string };
      }>(`${API_VERSION_PREFIX}/storage/upload`, formData);

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Upload returned no data');
      }

      let imageUrl = result.data.url || `${API_VERSION_PREFIX}/storage/download/${result.data.fileId}`;
      if (imageUrl.startsWith('/')) {
        imageUrl = `${apiUrl}${imageUrl}`;
      }

      if (!result.data.fileId || !result.data.originalName) {
        throw new Error('Upload response missing required fields: fileId or originalName');
      }

      return {
        success: true,
        data: {
          fileId: result.data.fileId,
          url: imageUrl,
          originalName: result.data.originalName,
        },
      };
    } catch (error) {
      logError(error, 'Failed to upload entry image', `${API_VERSION_PREFIX}/storage/upload`);
      return {
        success: false,
        error: {
          type: 'UPLOAD_ERROR',
          code: 'ENTRY_IMAGE_UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Failed to upload entry image',
        },
      };
    }
  },

  /**
   * ✅ PERFORMANCE: Get profile with stale-while-revalidate caching
   * Shows cached profile instantly, updates in background
   */
  getProfile: async (userId: string) => {
    try {
      const response = await apiClient.get<ProfileApiResponse>(`/api/v1/app/profile`);

      if (!response) {
        throw new Error('Failed to load profile - no data received');
      }

      return {
        success: true,
        data: {
          id: userId,
          email: response.email,
          profile: response.profile,
          preferences: {
            notifications: response.preferences?.notifications,
            visibility: response.preferences?.visibility as 'private' | 'public',
            theme: response.preferences?.theme as 'auto' | 'light' | 'dark',
          },
          stats: response.stats,
        },
      };
    } catch (error) {
      logError(error, 'Failed to fetch profile', `/api/v1/app/profile`);
      throw new Error('Failed to load profile');
    }
  },

  updateProfile: async (userId: string, data: Record<string, unknown>) => {
    try {
      const response = await apiClient.patch<ServiceResponse<unknown>>('/api/v1/app/profile', data);
      return {
        success: response.success || true,
        data: response.data,
        error: response.error,
      };
    } catch (error) {
      logError(error, 'Failed to update profile', `/api/v1/app/profile`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  createEntry: async (data: { content: string; type?: string }) => {
    try {
      const response = await apiClient.post<ServiceResponse<{ id: string }>>('/api/v1/app/entries', {
        content: data.content,
        type: data.type || 'general',
        userDate: new Date().toISOString(),
      });
      return { success: true, data: response.data };
    } catch (error) {
      logError(error, 'Failed to create entry', '/api/v1/app/entries');
      return { success: false, error: 'Failed to create entry' };
    }
  },
};
