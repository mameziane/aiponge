/**
 * Log Formatting
 *
 * Log formatters and secret redaction utilities
 */

import * as winston from 'winston';
import type { LogContext } from './types';

// Secret patterns to redact (key-based matching)
const SECRET_PATTERNS = [
  /authorization/i,
  /set-cookie/i,
  /apikey/i,
  /api[-_]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /bearer/i,
];

// Entry content fields - user's vulnerable mental health content (GDPR/privacy critical)
const ENTRY_CONTENT_FIELDS = [
  'content',
  'entryContent',
  'bookEntry',
  'bookContent',
  'rawEntry',
  'userEntry',
  'mentalNote',
  'reflectionContent',
];

// PII patterns for value-based detection and masking
const PII_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:|:(?::[0-9a-fA-F]{1,4}){1,7}\b/g,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
};

/**
 * Mask an email address preserving first 2 chars + domain hint
 * example@domain.com -> ex***@d***.com
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '[EMAIL]';

  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);
  const domainParts = domain.split('.');

  const maskedLocal = local.length > 2 ? local.substring(0, 2) + '***' : local.charAt(0) + '***';
  const maskedDomain =
    domainParts.length > 1
      ? domainParts[0].charAt(0) + '***.' + domainParts[domainParts.length - 1]
      : domain.charAt(0) + '***';

  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Mask a phone number preserving last 4 digits
 * +1-555-123-4567 -> ***-4567
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '[PHONE]';
  return '***-' + digits.slice(-4);
}

/**
 * Mask an IP address
 * 192.168.1.100 -> 192.168.***.***
 */
export function maskIpAddress(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 - mask last 4 segments
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + ':***:***:***:***';
  }
  // IPv4 - mask last 2 octets
  const parts = ip.split('.');
  if (parts.length !== 4) return '[IP]';
  return `${parts[0]}.${parts[1]}.***.***`;
}

/**
 * Sanitize a string value by masking any detected PII
 */
export function sanitizePiiInString(value: string): string {
  let sanitized = value;

  // Mask emails
  sanitized = sanitized.replace(PII_PATTERNS.email, match => maskEmail(match));

  // Mask phones (be careful to avoid false positives with numeric IDs)
  // Only mask if it looks like a phone with separators or country code
  sanitized = sanitized.replace(/\b(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]?\d{4}\b/g, match =>
    maskPhone(match)
  );

  // Mask SSNs
  sanitized = sanitized.replace(PII_PATTERNS.ssn, '***-**-****');

  // Mask credit cards
  sanitized = sanitized.replace(PII_PATTERNS.creditCard, '****-****-****-****');

  return sanitized;
}

/**
 * Sanitize an object for logging by masking PII values
 * Unlike maskSecrets which masks by key name, this masks by value content
 */
const EMAIL_KEYS = new Set(['email', 'useremail', 'recipient_email']);
const PHONE_KEYS = new Set(['phone', 'phonenumber', 'phone_e164', 'phonee164']);
const IP_KEYS = new Set(['ip', 'ipaddress', 'ip_address', 'clientip']);

function sanitizePiiValue(key: string, value: unknown, maxDepth: number): unknown {
  const lowerKey = key.toLowerCase();
  if (EMAIL_KEYS.has(lowerKey)) {
    return typeof value === 'string' ? maskEmail(value) : '[EMAIL]';
  }
  if (PHONE_KEYS.has(lowerKey)) {
    return typeof value === 'string' ? maskPhone(value) : '[PHONE]';
  }
  if (IP_KEYS.has(lowerKey)) {
    return typeof value === 'string' ? maskIpAddress(value) : '[IP]';
  }
  if (typeof value === 'string') {
    return sanitizePiiInString(value);
  }
  if (typeof value === 'object') {
    return sanitizePii(value, maxDepth - 1);
  }
  return value;
}

export function sanitizePii(obj: unknown, maxDepth = 5): unknown {
  if (maxDepth <= 0 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizePiiInString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizePii(item, maxDepth - 1));
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    sanitized[key] = sanitizePiiValue(key, value, maxDepth);
  }

  return sanitized;
}

/**
 * Redacts sensitive information from objects
 * Includes secrets (API keys, tokens) and user content
 */
export function maskSecrets(obj: unknown, maxDepth = 3): unknown {
  if (maxDepth <= 0 || obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskSecrets(item, maxDepth - 1));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSecret = SECRET_PATTERNS.some(pattern => pattern.test(key));
    const isEntryContent = ENTRY_CONTENT_FIELDS.includes(key);

    if (isSecret) {
      masked[key] = '[REDACTED]';
    } else if (isEntryContent) {
      masked[key] = '[ENTRY_CONTENT_REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSecrets(value, maxDepth - 1);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Combined sanitization: masks secrets and PII
 */
export function sanitizeForLogging(obj: unknown, maxDepth = 5): unknown {
  // First mask secrets by key name
  const secretsMasked = maskSecrets(obj, maxDepth);
  // Then sanitize PII from values
  return sanitizePii(secretsMasked, maxDepth);
}

/**
 * Safe JSON stringification with size limits
 * Applies both secret and PII masking
 */
export function safeStringify(obj: unknown, maxSize = 10000): string {
  try {
    const str = JSON.stringify(sanitizeForLogging(obj));
    return str.length > maxSize ? str.substring(0, maxSize) + '...[TRUNCATED]' : str;
  } catch (_error) {
    return '[CIRCULAR_OR_INVALID_JSON]';
  }
}

/**
 * Development console format
 */
export function createDevFormat(correlationStorage: { getStore: () => LogContext | undefined }): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, service, correlationId, module: moduleCtx, ...meta }) => {
      const context = correlationStorage.getStore();
      const finalCorrelationId = correlationId || context?.correlationId;

      const correlation = finalCorrelationId ? ` [${String(finalCorrelationId).slice(0, 8)}]` : '';
      const moduleInfo = moduleCtx ? ` ${moduleCtx}` : '';
      const serviceInfo = service ? `[${service}]` : '';
      const metaStr = Object.keys(meta).length > 0 ? ` ${safeStringify(meta, 1000)}` : '';

      return `${timestamp} ${level}${serviceInfo}${correlation}${moduleInfo}: ${message}${metaStr}`;
    })
  );
}

/**
 * Production JSON format
 * Applies both secret and PII masking for compliance
 */
export function createProdFormat(correlationStorage: { getStore: () => LogContext | undefined }): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(info => {
      const context = correlationStorage.getStore();
      if (context) {
        info.correlationId = info.correlationId || context.correlationId;
        info.userId = info.userId || context.userId;
      }

      // Use combined sanitization for both secrets and PII
      const sanitized = sanitizeForLogging(info);
      return safeStringify(sanitized, 50000);
    })
  );
}
