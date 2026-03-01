/**
 * AI Analytics Service - Presentation Utility Helpers
 * Shared helpers for route handlers and controllers.
 */

import { createIntervalScheduler } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('ai-analytics-service:helpers');

// ================================
// TIME RANGE PARSING
// ================================

/**
 * Parse a time range string (e.g., "30m", "24h", "7d") into a Date.
 * Falls back to parsing as an ISO date string if the format doesn't match.
 */
export function parseTimeRange(timeRange: string): Date {
  const now = new Date();
  const match = timeRange.match(/^(\d+)(m|h|d)$/);

  if (!match) {
    return new Date(timeRange);
  }

  const [, value, unit] = match;
  const amount = parseInt(value, 10);

  switch (unit) {
    case 'm':
      return new Date(now.getTime() - amount * 60 * 1000);
    case 'h':
      return new Date(now.getTime() - amount * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

// ================================
// TEMPORARY PDF STORAGE
// ================================

const MAX_PDF_STORAGE = 100;
const tempPdfStorage = new Map<string, { buffer: Buffer; expiresAt: number }>();

// Start the cleanup scheduler for expired PDFs
const pdfCleanupScheduler = createIntervalScheduler({
  name: 'temp-pdf-cleanup',
  serviceName: 'ai-analytics-service',
  intervalMs: 10 * 60 * 1000,
  handler: () => {
    const now = Date.now();
    for (const [id, data] of tempPdfStorage.entries()) {
      if (data.expiresAt < now) {
        tempPdfStorage.delete(id);
        logger.debug('Cleaned up expired PDF', { id });
      }
    }
  },
});
pdfCleanupScheduler.start();

/**
 * Store a PDF buffer in temporary in-memory storage with LRU eviction.
 */
export function storeTempPdf(id: string, buffer: Buffer, expiresAt: number): void {
  while (tempPdfStorage.size >= MAX_PDF_STORAGE) {
    const lruKey = tempPdfStorage.keys().next().value;
    if (lruKey === undefined) break;
    tempPdfStorage.delete(lruKey);
    logger.info('LRU eviction in temp PDF storage (max {})', { data0: String(MAX_PDF_STORAGE) });
  }
  tempPdfStorage.set(id, { buffer, expiresAt });
}

/**
 * Retrieve a PDF from temporary storage. Returns undefined if expired or not found.
 * Refreshes the entry's position for LRU tracking.
 */
export function getTempPdf(id: string): { buffer: Buffer; expiresAt: number } | undefined {
  const entry = tempPdfStorage.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    tempPdfStorage.delete(id);
    return undefined;
  }
  tempPdfStorage.delete(id);
  tempPdfStorage.set(id, entry);
  return entry;
}
