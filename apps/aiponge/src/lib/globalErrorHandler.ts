import { Alert } from 'react-native';
import { i18n } from '../i18n';
import { serializeError, checkIsBackendUnavailable } from '../utils/errorSerialization';
import { logger } from './logger';

const THROTTLE_MS = 3000;
let lastAlertTime = 0;
let lastAlertMessage = '';

function shouldThrottle(message: string): boolean {
  const now = Date.now();
  if (message === lastAlertMessage && now - lastAlertTime < THROTTLE_MS) {
    return true;
  }
  lastAlertTime = now;
  lastAlertMessage = message;
  return false;
}

function t(key: string, fallback: string): string {
  if (!i18n.isInitialized) return fallback;
  const result = i18n.t(key, { defaultValue: fallback });
  return typeof result === 'string' ? result : fallback;
}

interface QueryMeta {
  handledByAppQuery?: boolean;
  silentError?: boolean;
  context?: string;
}

function getStatusCode(error: unknown): number | undefined {
  const err = error as { response?: { status?: number }; status?: number };
  return err?.response?.status ?? err?.status;
}

export function handleGlobalQueryError(error: unknown, meta?: QueryMeta): void {
  if (meta?.handledByAppQuery || meta?.silentError) {
    return;
  }

  const statusCode = getStatusCode(error);
  const serialized = serializeError(error);

  if (statusCode === 401 || statusCode === 403) {
    return;
  }

  if (checkIsBackendUnavailable(error)) {
    logger.warn('Global error handler: backend unavailable', { code: serialized.code, status: statusCode });
    return;
  }

  let title: string;
  let message: string;

  if (statusCode && statusCode >= 500) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.serverError', 'Something on our end needs a moment. Please try again shortly.');
  } else if (!statusCode && !serialized.code) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.networkError', "Something got in the way. Check your connection when you're ready.");
  } else if (statusCode === 404) {
    return;
  } else if (statusCode === 429) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.rateLimited', "Let's slow down a moment. Try again in a bit.");
  } else {
    return;
  }

  if (shouldThrottle(message)) {
    return;
  }

  Alert.alert(title, message);
}

export function handleGlobalMutationError(error: unknown, meta?: QueryMeta): void {
  if (meta?.handledByAppQuery || meta?.silentError) {
    return;
  }

  const statusCode = getStatusCode(error);
  const serialized = serializeError(error);

  if (statusCode === 401 || statusCode === 403 || statusCode === 409) {
    return;
  }

  if (checkIsBackendUnavailable(error)) {
    logger.warn('Global mutation error handler: backend unavailable', { code: serialized.code, status: statusCode });
    return;
  }

  let title: string;
  let message: string;

  if (statusCode && statusCode >= 500) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.serverError', 'Something on our end needs a moment. Please try again shortly.');
  } else if (!statusCode) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.networkError', "Something got in the way. Check your connection when you're ready.");
  } else if (statusCode === 429) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message = t('errors.rateLimited', "Let's slow down a moment. Try again in a bit.");
  } else if (statusCode === 422 || statusCode === 400) {
    title = t('errors.somethingWentWrong', 'Something went wrong');
    message =
      serialized.message || t('errors.unexpectedIssue', 'We encountered an unexpected issue. Please try again.');
  } else {
    return;
  }

  if (shouldThrottle(message)) {
    return;
  }

  Alert.alert(title, message);
}
