/**
 * Security Utilities for AI Providers Domain
 * Pure utility functions for sanitization and redaction of sensitive data
 * No infrastructure dependencies - safe for use in domain layer
 */

import { ProviderConfigurationDB as ProviderConfiguration, InsertProviderConfiguration } from '@schema/schema';

const SENSITIVE_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /bearer[_-]?token/i,
  /client[_-]?secret/i,
  /secret[_-]?key/i,
  /private[_-]?key/i,
  /refresh[_-]?token/i,
  /session[_-]?token/i,

  /authorization/i,
  /x[_-]?api[_-]?key/i,
  /x[_-]?auth[_-]?token/i,

  /password/i,
  /passwd/i,
  /pass/i,

  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /cert/i,
  /certificate/i,
  /signature/i,

  /openai[_-]?key/i,
  /anthropic[_-]?key/i,
  /google[_-]?key/i,
  /azure[_-]?key/i,
  /aws[_-]?key/i,
  /huggingface[_-]?token/i,
];

const SECRET_VALUE_PATTERNS = [
  /^sk-[a-zA-Z0-9]{40,}$/,
  /^pk-[a-zA-Z0-9]{40,}$/,
  /^xoxb-[a-zA-Z0-9-]{40,}$/,
  /^ghp_[a-zA-Z0-9]{36}$/,
  /^[a-zA-Z0-9]{32}$/,
  /^[a-zA-Z0-9]{64}$/,
  /^[a-zA-Z0-9+/]{40,}={0,2}$/,
  /Bearer\s+[a-zA-Z0-9+/=]+/i,
  /^AIza[a-zA-Z0-9_-]{35}$/,
];

export function maskSecret(value: string): string {
  if (!value || typeof value !== 'string' || value.length <= 8) {
    return '***REDACTED***';
  }

  const start = value.substring(0, 4);
  const end = value.substring(value.length - 4);
  const middle = '*'.repeat(Math.max(4, value.length - 8));

  return `${start}${middle}${end}`;
}

function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName));
}

function looksLikeSecret(value: string): boolean {
  if (!value || typeof value !== 'string' || value.length < 8) {
    return false;
  }

  return SECRET_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

function sanitizePrimitive(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return looksLikeSecret(obj) ? maskSecret(obj) : obj;
  }

  return obj;
}

function sanitizeArray(arr: unknown[], depth: number): unknown[] {
  return arr.map(item => sanitizeObject(item, depth + 1));
}

function sanitizeRecord(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      sanitized[key] = typeof value === 'string' ? maskSecret(value) : '***REDACTED***';
    } else {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return sanitizePrimitive(obj);
  }

  if (Array.isArray(obj)) {
    return sanitizeArray(obj, depth);
  }

  if (typeof obj === 'object') {
    return sanitizeRecord(obj as Record<string, unknown>, depth);
  }

  return obj;
}

export function sanitizeProviderConfiguration(
  config: ProviderConfiguration | InsertProviderConfiguration
): ProviderConfiguration | InsertProviderConfiguration {
  const sanitized = { ...config };

  if (sanitized.configuration) {
    sanitized.configuration = sanitizeObject(sanitized.configuration);
  }

  return sanitized;
}

export function sanitizeProviderConfigurations(configs: ProviderConfiguration[]): ProviderConfiguration[] {
  return configs.map(config => sanitizeProviderConfiguration(config) as ProviderConfiguration);
}

export function sanitizeErrorMessage(error: string | Error): string {
  let message = typeof error === 'string' ? error : error.message;

  SECRET_VALUE_PATTERNS.forEach(pattern => {
    message = message.replace(pattern, '***REDACTED***');
  });

  return message;
}

export function sanitizeForLogging(data: unknown): unknown {
  return sanitizeObject(data);
}

function checkStringValue(value: string, path: string, suspiciousFields: string[]): void {
  if (looksLikeSecret(value)) {
    suspiciousFields.push(path || 'root');
  }
}

function checkArrayValue(value: unknown[], path: string, suspiciousFields: string[]): void {
  value.forEach((item, index) => {
    checkObject(item, `${path}[${index}]`, suspiciousFields);
  });
}

function checkRecordValue(value: Record<string, unknown>, path: string, suspiciousFields: string[]): void {
  for (const [key, val] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (isSensitiveField(key) && typeof val === 'string' && !val.includes('***')) {
      suspiciousFields.push(currentPath);
    }

    checkObject(val, currentPath, suspiciousFields);
  }
}

function checkObject(value: unknown, path: string, suspiciousFields: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    checkStringValue(value, path, suspiciousFields);
    return;
  }

  if (Array.isArray(value)) {
    checkArrayValue(value, path, suspiciousFields);
    return;
  }

  if (typeof value === 'object') {
    checkRecordValue(value as Record<string, unknown>, path, suspiciousFields);
  }
}

export function containsSecrets(obj: unknown): { hasSecrets: boolean; suspiciousFields: string[] } {
  const suspiciousFields: string[] = [];

  checkObject(obj, '', suspiciousFields);

  return {
    hasSecrets: suspiciousFields.length > 0,
    suspiciousFields,
  };
}
