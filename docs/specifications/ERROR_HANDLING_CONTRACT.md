# Error Handling Contract

This document defines the standardized error handling patterns for the Aiponge mobile app.

## Core Principles

1. **Never silently fail** - All errors must be logged
2. **User-friendly messages** - Technical errors are translated to actionable messages
3. **Correlation IDs** - All API errors include correlation IDs for debugging
4. **i18n support** - Error messages support translation

## Error Handling Utilities

### Location: `src/utils/errorSerialization.ts`

#### `serializeError(error, url?, correlationId?): SerializedError`

Converts any error type to a standardized structure:

```typescript
interface SerializedError {
  message: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
  context?: string;
  timestamp: number;
}
```

#### `logError(error, context?, url?, correlationId?): SerializedError`

Logs error with full context and returns serialized form:

- Uses appropriate log level based on status code
- 5xx → `logger.error`
- 4xx → `logger.warn`
- Silences expected 404s on auth endpoints

#### `getTranslatedFriendlyMessage(error, t): string`

Returns user-friendly translated message:

- Maps error codes to translation keys
- Falls back to original message for 4xx errors
- Returns generic message for unknown errors

### Location: `src/lib/queryErrorHandler.ts`

#### `createQueryErrorHandler(toast, context, endpoint, customTitle?, t?)`

Creates standardized handler for React Query queries:

```typescript
const { data } = useQuery({
  queryKey: ['/api/music'],
  onError: createQueryErrorHandler(toast, 'Music Query', '/api/music', undefined, t),
});
```

#### `createMutationErrorHandler(toast, context, endpoint, customTitle?, t?)`

Creates standardized handler for React Query mutations:

```typescript
const mutation = useMutation({
  mutationFn: createTrack,
  onError: createMutationErrorHandler(toast, 'Create Track', '/api/tracks', undefined, t),
});
```

#### `createSilentErrorHandler(context, endpoint)`

Logs error without showing toast (for background operations):

```typescript
const analyticsQuery = useQuery({
  queryKey: ['/api/analytics'],
  onError: createSilentErrorHandler('Analytics', '/api/analytics'),
});
```

## Standard Error Codes

| Code                  | HTTP Status | Translation Key             | User Message                                               |
| --------------------- | ----------- | --------------------------- | ---------------------------------------------------------- |
| `UNAUTHORIZED`        | 401         | `errors.sessionExpired`     | Your session has expired. Please log in again.             |
| `FORBIDDEN`           | 403         | `errors.noPermission`       | You don't have permission to perform this action.          |
| `NOT_FOUND`           | 404         | `errors.notFound`           | The requested item was not found.                          |
| `ALREADY_EXISTS`      | 409         | `errors.alreadyExists`      | This item already exists.                                  |
| `VALIDATION_ERROR`    | 400         | `errors.validationError`    | Please check your input and try again.                     |
| `RATE_LIMIT_EXCEEDED` | 429         | `errors.rateLimitExceeded`  | Too many requests. Please try again later.                 |
| `SERVICE_UNAVAILABLE` | 503         | `errors.serviceUnavailable` | Service temporarily unavailable. Please try again shortly. |
| `TIMEOUT_ERROR`       | -           | `errors.timeout`            | Request timed out. Please try again.                       |
| `ERR_NETWORK`         | -           | `errors.offline`            | You appear to be offline. Please check your connection.    |

## Implementation Pattern

### For Queries

```typescript
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createQueryErrorHandler } from '../lib/queryErrorHandler';
import { useToast } from '../hooks/useToast';

function MyComponent() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['/api/resource'],
    onError: createQueryErrorHandler(
      toast,
      'Resource Query',
      '/api/resource',
      undefined, // custom title (optional)
      t
    ),
  });
}
```

### For Mutations

```typescript
import { useMutation } from '@tanstack/react-query';
import { createMutationErrorHandler } from '../lib/queryErrorHandler';
import { apiRequest, queryClient } from '../lib/axiosApiClient';

function MyComponent() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: data => apiRequest('/api/resource', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/resource'] });
      toast({ title: t('common.success'), description: t('resource.created') });
    },
    onError: createMutationErrorHandler(
      toast,
      'Create Resource',
      '/api/resource',
      t('resource.createFailed'), // custom title
      t
    ),
  });
}
```

### For Direct API Calls

```typescript
import { logError, getTranslatedFriendlyMessage } from '../utils/errorSerialization';

async function fetchData() {
  try {
    const result = await apiClient.get('/api/data');
    return result;
  } catch (error) {
    const serialized = logError(error, 'Fetch Data', '/api/data');
    const message = getTranslatedFriendlyMessage(serialized, t);
    toast({ title: t('common.error'), description: message, variant: 'destructive' });
    throw error;
  }
}
```

## Migration Guide

### Old Pattern (Deprecated)

```typescript
// ❌ Don't do this
try {
  await apiCall();
} catch (error: any) {
  console.error(error);
  toast({ title: 'Error', description: error.message });
}
```

### New Pattern (Preferred)

```typescript
// ✅ Do this
try {
  await apiCall();
} catch (error) {
  const serialized = logError(error, 'Context Name', '/api/endpoint');
  toast({
    title: t('common.error'),
    description: getTranslatedFriendlyMessage(serialized, t),
    variant: 'destructive',
  });
}
```

## Backend Unavailable Handling

The `axiosApiClient` reports backend unavailability through the `setBackendErrorReporter`:

```typescript
apiClient.setBackendErrorReporter(error => {
  const serialized = serializeError(error);
  if (isBackendUnavailableError(serialized)) {
    // Show global "backend unavailable" banner
    setGlobalError(serialized);
  }
});
```

## Fallback Translator

When no translation function is provided, the error handlers use a fallback that:

1. Returns string fallback parameters directly
2. Returns `defaultValue` from options objects
3. Falls back to the translation key itself

This ensures error messages display correctly even before i18n is initialized.
