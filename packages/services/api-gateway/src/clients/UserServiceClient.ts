/**
 * User Profile Service Client
 * Typed client for user-service communication
 * Handles profiles, entries, insights, and analytics with automatic correlation ID propagation
 */

import { Request } from 'express';
import { getServiceUrl, type HttpClient, withServiceResilience } from '@aiponge/platform-core';
import { createRequestConfigWithCorrelation } from '../utils/createServiceClient';
import { ServiceResponse, wrapInServiceResponse } from '../utils/typeGuards';

// Type definitions
export interface UserProfile {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  bio?: string;
  goals?: string[];
  preferences?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Entry {
  id: string;
  userId: string;
  content: string;
  mood?: string;
  tags?: string[];
  createdAt: string;
}

export interface Insight {
  id: string;
  userId: string;
  type: string;
  content: string;
  source?: string;
  confidence?: number;
  createdAt: string;
}

export interface UserAnalytics {
  totalEntries: number;
  totalInsights: number;
  moodTrends?: unknown[];
  activityLevel?: string;
  lastActive?: string;
}

/**
 * User Profile Service Client with typed methods and correlation ID support
 */
export class UserServiceClient {
  private readonly baseUrl: string;
  private readonly httpClient: HttpClient;
  private readonly requestConfig: Record<string, unknown>;

  constructor(httpClient: HttpClient, req: Request) {
    this.baseUrl = getServiceUrl('user-service');
    this.httpClient = httpClient;
    this.requestConfig = createRequestConfigWithCorrelation(req);
  }

  /**
   * Get user profile by ID
   * Returns the full response envelope so caller can check success/error
   */
  async getProfile(userId: string): Promise<ServiceResponse<UserProfile>> {
    return withServiceResilience('user-service', 'getProfile', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/profiles/${userId}`, this.requestConfig);

      return wrapInServiceResponse<UserProfile>(response);
    });
  }

  /**
   * Get user profile summary
   */
  async getProfileSummary(userId: string): Promise<unknown> {
    return withServiceResilience('user-service', 'getProfileSummary', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/profiles/${userId}/summary`, this.requestConfig);
      return response;
    });
  }

  /**
   * Get user profile themes
   */
  async getProfileThemes(userId: string): Promise<unknown> {
    return withServiceResilience('user-service', 'getProfileThemes', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/profiles/${userId}/themes`, this.requestConfig);
      return response;
    });
  }

  /**
   * Get user profile metrics
   */
  async getProfileMetrics(userId: string): Promise<unknown> {
    return withServiceResilience('user-service', 'getProfileMetrics', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/profiles/${userId}/metrics`, this.requestConfig);
      return response;
    });
  }

  /**
   * Get user entries
   * Returns the full response envelope so caller can check success/error
   */
  async getEntries(userId: string, limit?: number): Promise<ServiceResponse<Entry[]>> {
    return withServiceResilience('user-service', 'getEntries', async () => {
      const url = limit
        ? `${this.baseUrl}/api/entries/${userId}?limit=${limit}`
        : `${this.baseUrl}/api/entries/${userId}`;

      const response = await this.httpClient.get(url, this.requestConfig);
      return wrapInServiceResponse<Entry[]>(response);
    });
  }

  /**
   * Get user insights
   * Returns the full response envelope so caller can check success/error
   */
  async getInsights(userId: string, limit?: number): Promise<ServiceResponse<Insight[]>> {
    return withServiceResilience('user-service', 'getInsights', async () => {
      const url = limit
        ? `${this.baseUrl}/api/insights?userId=${userId}&limit=${limit}`
        : `${this.baseUrl}/api/insights?userId=${userId}`;

      const response = await this.httpClient.get(url, this.requestConfig);
      return wrapInServiceResponse<Insight[]>(response);
    });
  }

  /**
   * Get user analytics
   * Returns the full response envelope so caller can check success/error
   */
  async getAnalytics(userId: string): Promise<ServiceResponse<UserAnalytics>> {
    return withServiceResilience('user-service', 'getAnalytics', async () => {
      const response = await this.httpClient.get(`${this.baseUrl}/api/analytics?userId=${userId}`, this.requestConfig);

      return wrapInServiceResponse<UserAnalytics>(response);
    });
  }
}
