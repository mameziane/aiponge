/**
 * Encryption Service
 * Provides AES-256-GCM encryption for sensitive user data (entries, insights)
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Random IV per encryption operation
 * - Authentication tag to prevent tampering
 * - Key derivation from environment variable
 * - FAIL-FAST: Service will not start without valid encryption key
 */

import crypto from 'crypto';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import { AuthError } from '../../application/errors/errors';

const logger = getLogger('encryption-service');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class EncryptionService {
  private static instance: EncryptionService | null = null;
  private encryptionKey: Buffer | null = null;
  private initialized: boolean = false;

  private constructor() {
    // Lazy initialization - don't fail at construction time
  }

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  private ensureInitialized(): void {
    if (this.initialized) return;

    const keyEnv = process.env.ENTRY_ENCRYPTION_KEY;
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

    if (!keyEnv) {
      if (isDevelopment) {
        // In development/test, use a deterministic key and warn
        logger.warn('ENTRY_ENCRYPTION_KEY not set - using development-only fallback key. DO NOT use in production!');
        // Development-only key (32 bytes, base64)
        const devKey = 'ZGV2ZWxvcG1lbnQta2V5LWRvLW5vdC11c2UtaW4tcHJvZA==';
        this.encryptionKey = Buffer.alloc(32);
        Buffer.from(devKey, 'base64').copy(this.encryptionKey, 0, 0, 32);
        this.initialized = true;
        return;
      }

      const errorMsg =
        'CRITICAL: ENTRY_ENCRYPTION_KEY environment variable is required for user data protection. ' +
        "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"";
      logger.error(errorMsg);
      throw AuthError.internalError(errorMsg);
    }

    try {
      const keyBuffer = Buffer.from(keyEnv, 'base64');

      if (keyBuffer.length !== KEY_LENGTH) {
        const errorMsg =
          `CRITICAL: Invalid encryption key length: ${keyBuffer.length} bytes (expected ${KEY_LENGTH}). ` +
          'The key must be exactly 32 bytes (256 bits) encoded as base64.';
        logger.error(errorMsg);
        throw AuthError.internalError(errorMsg);
      }

      this.encryptionKey = keyBuffer;
      this.initialized = true;
      logger.info('Encryption service initialized successfully - user data will be encrypted at rest');
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      const errorMsg = `CRITICAL: Failed to initialize encryption key: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMsg);
      throw AuthError.internalError(errorMsg);
    }
  }

  isEncryptionEnabled(): boolean {
    this.ensureInitialized();
    return this.initialized && this.encryptionKey !== null;
  }

  encrypt(plaintext: string): string {
    if (!plaintext || plaintext.trim().length === 0) {
      return plaintext;
    }

    this.ensureInitialized();

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey!, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);

      return 'ENC:' + combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', { error: serializeError(error) });
      throw AuthError.internalError('Failed to encrypt sensitive data');
    }
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext || !ciphertext.startsWith('ENC:')) {
      return ciphertext;
    }

    this.ensureInitialized();

    try {
      const combined = Buffer.from(ciphertext.slice(4), 'base64');

      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey!, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', { error: serializeError(error) });
      throw AuthError.internalError('Failed to decrypt sensitive data - data may be corrupted or key may have changed');
    }
  }

  encryptObject<T extends Record<string, unknown>>(obj: T, fieldsToEncrypt: (keyof T)[]): T {
    const result = { ...obj } as T;

    for (const field of fieldsToEncrypt) {
      const value = result[field];
      if (typeof value === 'string' && value.length > 0) {
        (result as Record<keyof T, unknown>)[field] = this.encrypt(value);
      }
    }

    return result;
  }

  decryptObject<T extends Record<string, unknown>>(obj: T, fieldsToDecrypt: (keyof T)[]): T {
    const result = { ...obj } as T;

    for (const field of fieldsToDecrypt) {
      const value = result[field];
      if (typeof value === 'string' && value.startsWith('ENC:')) {
        (result as Record<keyof T, unknown>)[field] = this.decrypt(value);
      }
    }

    return result;
  }

  static generateKey(): string {
    const key = crypto.randomBytes(KEY_LENGTH);
    return key.toString('base64');
  }
}

export const encryptionService = EncryptionService.getInstance();
