/**
 * Authentication Types
 *
 * Shared interfaces and types for authentication functionality
 */

import { Request } from 'express';

/**
 * Authenticated Request interface
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
  correlationId: string;
}

/**
 * Authentication options
 */
export interface AuthOptions {
  skipPaths?: string[];
  allowApiKey?: boolean;
  allowServiceAuth?: boolean;
  secret?: string;
}
