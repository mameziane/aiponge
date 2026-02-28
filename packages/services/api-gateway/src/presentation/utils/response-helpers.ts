/**
 * Standardized Response Helpers for api-gateway
 * Re-exports from @aiponge/platform-core with service-specific configuration
 * Includes additional gateway-specific helpers for upstream error forwarding
 */

import { createGatewayResponseHelpers } from '@aiponge/platform-core';
import { extractErrorInfo, getCorrelationId } from '@aiponge/shared-contracts';

const helpers = createGatewayResponseHelpers('api-gateway');

export const { sendSuccess, sendCreated, forwardServiceError, ServiceErrors } = helpers;
export { extractErrorInfo, getCorrelationId };
