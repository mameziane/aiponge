/**
 * Standardized Response Helpers for user-service
 * Re-exports from @aiponge/platform-core with service-specific configuration
 */

import { createResponseHelpers } from '@aiponge/platform-core';
import { extractErrorInfo, getCorrelationId } from '@aiponge/shared-contracts';

const helpers = createResponseHelpers('user-service');

export const { sendSuccess, sendCreated, ServiceErrors } = helpers;
export { extractErrorInfo, getCorrelationId };
