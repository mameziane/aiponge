/**
 * Live Contract Tests Setup
 *
 * Self-contained setup for contract validation tests.
 */

import { setTimeout } from 'timers/promises';

export const SERVICE_URLS = {
  API_GATEWAY: process.env.API_GATEWAY_URL || 'http://localhost:8080',
  MUSIC_SERVICE: process.env.MUSIC_SERVICE_URL || 'http://localhost:8083',
  USER_SERVICE: process.env.USER_SERVICE_URL || 'http://localhost:8082',
};

export const TIMEOUTS = {
  REQUEST: 15000,
  HEALTH_CHECK: 5000,
};

export interface RequestResult {
  data: any;
  status: number;
  ok: boolean;
}

export async function makeRequest(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUTS.REQUEST
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    global.clearTimeout(timeoutId);
  }
}

export async function makeRequestWithStatus(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUTS.REQUEST
): Promise<RequestResult> {
  const controller = new AbortController();
  const timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    let data: any;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = { error: { message: 'Invalid JSON response' } };
      }
    } else {
      const text = await response.text();
      data = { error: { message: text || 'Non-JSON response' } };
    }

    return {
      data,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    global.clearTimeout(timeoutId);
  }
}

export async function createGuestUser(): Promise<{ id: string; accessToken: string } | null> {
  try {
    const response = await makeRequest(
      `${SERVICE_URLS.API_GATEWAY}/api/v1/auth/guest`,
      { method: 'POST' },
      TIMEOUTS.REQUEST
    );

    if (response.success && response.data) {
      return {
        id: response.data.user?.id || response.data.id,
        accessToken: response.data.token || response.data.accessToken,
      };
    }
    return null;
  } catch {
    return null;
  }
}
