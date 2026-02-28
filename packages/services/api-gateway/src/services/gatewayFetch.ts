import { DomainError, signUserIdHeader } from '@aiponge/platform-core';

const DEFAULT_GATEWAY_TIMEOUT_MS = 30000;

interface GatewayFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function gatewayFetch(url: string | URL, init?: GatewayFetchOptions): Promise<Response> {
  const hasSignal = init?.signal != null;
  const timeoutMs = init?.timeoutMs ?? DEFAULT_GATEWAY_TIMEOUT_MS;

  const headers = new Headers(init?.headers);

  const userId = headers.get('x-user-id');
  if (userId) {
    const userRole = headers.get('x-user-role') || undefined;
    const signedHeaders = signUserIdHeader(userId, userRole);
    for (const [key, value] of Object.entries(signedHeaders)) {
      headers.set(key, value);
    }
    headers.set('x-gateway-service', 'api-gateway');
  }

  const { timeoutMs: _timeoutMs, ...fetchInit } = init ?? {};

  try {
    return await fetch(url, {
      ...fetchInit,
      headers,
      signal: hasSignal ? init!.signal : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      const urlStr = typeof url === 'string' ? url : url.toString();
      throw new DomainError(`Gateway request timed out after ${timeoutMs}ms: ${urlStr}`, 504);
    }
    throw error;
  }
}
