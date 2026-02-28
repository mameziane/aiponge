import { AxiosError } from 'axios';
import { logger } from '../logger';

interface ErrorLoggingDeps {
  isLoggingOut: () => boolean;
  reportError: (error: unknown) => void;
}

interface ApiErrorResponse {
  error?: string | { code?: string; message?: string };
  message?: string;
  code?: string;
}

interface SuppressionRule {
  status: number;
  pathIncludes?: string;
  messageEquals?: string;
}

const SUPPRESSED_ERRORS: SuppressionRule[] = [
  { status: 404, pathIncludes: '/auth/me' },
  { status: 404, pathIncludes: '/library/schedules/' },
  { status: 404, pathIncludes: '/library/track-play' },
  { status: 404, pathIncludes: '/progress' },
  { status: 409, messageEquals: 'Track already in playlist' },
];

const QUOTA_CODES = new Set([
  'SUBSCRIPTION_LIMIT_EXCEEDED',
  'USAGE_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'INSUFFICIENT_CREDITS',
  'PAYMENT_REQUIRED',
]);

function matchesSuppression(status: number, url: string, data: ApiErrorResponse | undefined): boolean {
  return SUPPRESSED_ERRORS.some(rule => {
    if (rule.status !== status) return false;
    if (rule.pathIncludes && !url.includes(rule.pathIncludes)) return false;
    if (rule.messageEquals) {
      const msg = typeof data?.error === 'string' ? data.error : data?.message;
      if (msg !== rule.messageEquals) return false;
    }
    return true;
  });
}

function isQuotaOrPaymentError(status: number, data: ApiErrorResponse | undefined): boolean {
  if (status !== 402 && status !== 403) return false;
  const errorObj = data?.error;
  const code = (typeof errorObj === 'object' ? errorObj?.code : undefined) || data?.code;
  return code ? QUOTA_CODES.has(code) : status === 402;
}

export function createErrorLoggingInterceptor(deps: ErrorLoggingDeps) {
  return (error: AxiosError): Promise<never> => {
    const correlationId = error.config?.correlationId;
    const requestUrl = error.config?.url || '';
    const status = error.response?.status;
    const responseData = error.response?.data as ApiErrorResponse | undefined;

    if (status) {
      const isSuppressed =
        (status === 401 && deps.isLoggingOut()) ||
        matchesSuppression(status, requestUrl, responseData) ||
        isQuotaOrPaymentError(status, responseData);

      if (!isSuppressed) {
        logger.error('API request failed', error, { status, url: requestUrl, correlationId });
      }
    } else {
      const isRefreshFlowError = error.message === 'No refresh token available';
      if (!isRefreshFlowError) {
        logger.warn('API request failed (no response from server)', {
          url: requestUrl,
          correlationId,
          code: error.code,
        });
      }
    }

    deps.reportError(error);

    return Promise.reject(error);
  };
}
