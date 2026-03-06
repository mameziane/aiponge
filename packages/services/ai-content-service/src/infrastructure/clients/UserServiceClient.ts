/**
 * User Service HTTP Client
 * Handles communication with user-service for orchestration flows.
 * Fetches members, preferences, and book types needed for plan generation.
 */

import { getServiceUrl, getLogger } from '../../config/service-urls';
import { withServiceResilience, HttpClient as PlatformHttpClient } from '@aiponge/platform-core';

const logger = getLogger('ai-content-service-userserviceclient');

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface UserMember {
  id: string;
  name: string;
  relationship: string;
}

export interface UserPreferences {
  musicGenre: string | null;
  musicPreferences: string | null;
  culturalLanguages: string | null;
  language: string | null;
  vocalGender: string | null;
  musicInstruments: string | null;
  currentMood: string | null;
}

export interface BookType {
  id: string;
  name: string;
  description: string;
  isUserCreatable: boolean;
}

export class UserServiceClient {
  private httpClient: PlatformHttpClient;

  constructor() {
    this.httpClient = new PlatformHttpClient({
      timeout: 10000,
      retries: 2,
      useServiceAuth: true,
      serviceName: 'ai-content-service',
    });
  }

  /**
   * Get creator's members list (for recipient picker)
   */
  async getMembers(creatorId: string): Promise<UserMember[]> {
    return withServiceResilience('user-service', 'getMembers', async () => {
      const url = `${getServiceUrl('user-service')}/api/creator-members/${creatorId}/members`;
      const result = await this.httpClient.get<ServiceResponse<UserMember[]>>(url);

      if (!result?.success || !result.data) {
        logger.warn('Failed to fetch members', { creatorId });
        return [];
      }

      return result.data;
    });
  }

  /**
   * Get user preferences (music, language, mood etc.)
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    return withServiceResilience('user-service', 'getPreferences', async () => {
      const url = `${getServiceUrl('user-service')}/api/users/${userId}/preferences`;
      const result = await this.httpClient.get<ServiceResponse<UserPreferences>>(url);

      if (!result?.success || !result.data) {
        logger.warn('Failed to fetch preferences, using defaults', { userId });
        return {
          musicGenre: null,
          musicPreferences: null,
          culturalLanguages: null,
          language: null,
          vocalGender: null,
          musicInstruments: null,
          currentMood: null,
        };
      }

      return result.data;
    });
  }

  /**
   * Get available book types (for the LLM planner)
   */
  async getBookTypes(): Promise<BookType[]> {
    return withServiceResilience('user-service', 'getBookTypes', async () => {
      const url = `${getServiceUrl('user-service')}/api/book-types`;
      const result = await this.httpClient.get<ServiceResponse<BookType[]>>(url);

      if (!result?.success || !result.data) {
        logger.warn('Failed to fetch book types');
        return [];
      }

      // Only return types that users can create
      return result.data.filter(bt => bt.isUserCreatable !== false);
    });
  }
}
