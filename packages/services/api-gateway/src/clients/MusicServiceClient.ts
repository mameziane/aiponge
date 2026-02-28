/**
 * Music Service Client
 * Typed client for music-service communication with correlation ID propagation
 */

import { Request } from 'express';
import { getServiceUrl, type HttpClient, withServiceResilience } from '@aiponge/platform-core';
import { createRequestConfigWithCorrelation } from '../utils/createServiceClient';
import { ServiceResponse, wrapInServiceResponse } from '../utils/typeGuards';

// Type definitions
export interface MusicTrack {
  id: string;
  title: string;
  genre?: string;
  mood?: string;
  duration?: number;
  url?: string;
  createdAt: string;
}

export interface RecentMusic {
  tracks: MusicTrack[];
  totalPlayed?: number;
  lastPlayed?: string;
}

/**
 * Music Service Client with typed methods and correlation ID support
 */
export class MusicServiceClient {
  private readonly baseUrl: string;
  private readonly httpClient: HttpClient;
  private readonly requestConfig: Record<string, unknown>;

  constructor(httpClient: HttpClient, req: Request) {
    this.baseUrl = getServiceUrl('music-service');
    this.httpClient = httpClient;
    this.requestConfig = createRequestConfigWithCorrelation(req);
  }

  /**
   * Get recent music for user
   * Returns the full response envelope so caller can check success/error
   */
  async getRecentMusic(userId: string, limit?: number): Promise<ServiceResponse<MusicTrack[]>> {
    return withServiceResilience('music-service', 'getRecentMusic', async () => {
      const url = limit
        ? `${this.baseUrl}/api/music/recent?userId=${userId}&limit=${limit}`
        : `${this.baseUrl}/api/music/recent?userId=${userId}`;

      const response = await this.httpClient.get(url, this.requestConfig);
      return wrapInServiceResponse<MusicTrack[]>(response);
    });
  }

  /**
   * Get music track by ID
   * Returns the full response envelope so caller can check success/error
   */
  async getTrackById(trackId: string): Promise<ServiceResponse<MusicTrack>> {
    return withServiceResilience('music-service', 'getTrackById', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/music/${trackId}`, this.requestConfig);

      return wrapInServiceResponse<MusicTrack>(response);
    });
  }
}
